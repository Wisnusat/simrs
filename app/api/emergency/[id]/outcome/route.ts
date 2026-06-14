import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAuth, isGuardError } from '@/lib/api/guards'
import { syncInvoiceForEncounter } from '@/lib/api/invoice-builder'

type RouteContext = { params: Promise<{ id: string }> }

async function getCurrentPractitioner(supabase: ReturnType<typeof createClient>) {
    const { data: practitioner, error } = await (await supabase)
        .from('practitioners')
        .select('id, role, organization_id')
        .eq('user_id', (await (await supabase).auth.getUser()).data.user?.id ?? '')
        .eq('is_active', true)
        .single()

    if (error || !practitioner) return null
    return practitioner as { id: string; role: string; organization_id: string }
}

interface AdmissionData {
    room_location_id: string
    bed_number: string
    room_class: string
    dpjp_id: string
}

interface OutcomeBody {
    outcome: 'discharged' | 'referred' | 'admitted_inpatient'
    referred_to?: string
    referral_letter_no?: string
    admission_data?: AdmissionData
}

/**
 * PATCH /api/emergency/[id]/outcome
 * Set IGD outcome (discharged | referred | admitted_inpatient).
 * - Updates emergency_encounters outcome + status
 * - Closes base encounter (status finished)
 * - When admitted_inpatient: creates episodes_of_care + inpatient_admissions
 * Auth: Doctor only.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
    const rl = rateLimit(request, 'emergency:outcome', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAuth(supabase)
        if (isGuardError(auth)) return auth

        const practitioner = await getCurrentPractitioner(Promise.resolve(supabase))
        if (!practitioner) {
            return apiResponse.forbidden('Staff only')
        }

        // Outcome hanya boleh di-set oleh dokter
        if (practitioner.role !== 'doctor') {
            return apiResponse.forbidden('Doctor role required')
        }

        const { id } = await context.params

        // Ambil emergency encounter beserta encounter untuk org/patient context
        const { data: existing, error: findError } = await supabase
            .from('emergency_encounters')
            .select(`
                id,
                patient_id,
                encounter_id,
                outcome,
                encounters:encounter_id (
                    id,
                    organization_id
                )
            `)
            .eq('id', id)
            .single()

        if (findError || !existing) {
            return apiResponse.notFound('IGD encounter not found')
        }

        const body = (await request.json()) as OutcomeBody
        const { outcome, referred_to, referral_letter_no, admission_data } = body

        const allowedOutcomes: OutcomeBody['outcome'][] = ['discharged', 'referred', 'admitted_inpatient']
        if (!outcome || !allowedOutcomes.includes(outcome)) {
            return apiResponse.badRequest(`outcome must be one of: ${allowedOutcomes.join(', ')}`)
        }

        // Jika masuk rawat inap, admission_data wajib lengkap
        if (outcome === 'admitted_inpatient') {
            if (!admission_data) {
                return apiResponse.badRequest('admission_data is required when outcome is admitted_inpatient')
            }
            const { room_location_id, bed_number, room_class, dpjp_id } = admission_data
            if (!room_location_id || !bed_number || !room_class || !dpjp_id) {
                return apiResponse.badRequest('admission_data must include room_location_id, bed_number, room_class, and dpjp_id')
            }
        }

        const now = new Date()

        // Update emergency_encounters outcome & status
        const emergencyUpdates: Record<string, unknown> = {
            outcome,
            status: 'completed',
            updated_at: now.toISOString(),
        }

        if (referred_to !== undefined) emergencyUpdates.referred_to = referred_to
        if (referral_letter_no !== undefined) emergencyUpdates.referral_letter_no = referral_letter_no

        const { data: updatedEmergency, error: updateEmergencyError } = await supabase
            .from('emergency_encounters')
            .update(emergencyUpdates)
            .eq('id', id)
            .select()
            .single()

        if (updateEmergencyError || !updatedEmergency) {
            console.error('Emergency outcome update error:', updateEmergencyError)
            return apiResponse.serverError('Failed to update emergency outcome')
        }

        // Tutup encounter utama
        const { error: encounterUpdateError } = await supabase
            .from('encounters')
            .update({ status: 'finished', finished_at: now.toISOString() })
            .eq('id', existing.encounter_id)

        if (encounterUpdateError) {
            console.warn('Encounter close error (outcome):', encounterUpdateError)
        }

        let admissionId: string | null = null

        if (outcome === 'admitted_inpatient') {
            const orgId: string | undefined = (existing as any).encounters?.organization_id
            if (!orgId) {
                console.error('Missing organization_id for inpatient admission')
                return apiResponse.serverError('Organization context not found for inpatient admission')
            }

            const { room_location_id, bed_number, room_class, dpjp_id } = admission_data as AdmissionData

            const startDate = now.toISOString().slice(0, 10) // YYYY-MM-DD

            // Buat episode_of_care
            const { data: episode, error: episodeError } = await supabase
                .from('episodes_of_care')
                .insert({
                    patient_id: existing.patient_id,
                    organization_id: orgId,
                    start_date: startDate,
                    status: 'admitted',
                    dpjp_id,
                    room_location_id,
                    bed_number,
                })
                .select('id')
                .single()

            if (episodeError || !episode) {
                console.error('Episode of care create error:', episodeError)
                return apiResponse.serverError('Failed to create episode of care')
            }

            // Buat inpatient_admissions
            const { data: admission, error: admissionError } = await supabase
                .from('inpatient_admissions')
                .insert({
                    episode_of_care_id: episode.id,
                    patient_id: existing.patient_id,
                    admitted_from: 'igd',
                    admission_date: now.toISOString(),
                    dpjp_id,
                    room_location_id,
                    bed_number,
                    room_class,
                    status: 'admitted',
                })
                .select('id')
                .single()

            if (admissionError || !admission) {
                console.error('Inpatient admission create error:', admissionError)
                return apiResponse.serverError('Failed to create inpatient admission')
            }

            admissionId = admission.id
        }

        // Generate invoice for non-inpatient outcomes (discharged/referred)
        if (outcome !== 'admitted_inpatient') {
            syncInvoiceForEncounter(supabase, existing.encounter_id).catch(err => {
                console.error('Invoice sync error on emergency outcome:', err)
            })
        }

        return apiResponse.ok({
            status: 'completed',
            outcome,
            admission_id: admissionId,
            emergency_id: updatedEmergency.id,
        })
    } catch {
        return apiResponse.serverError()
    }
}
