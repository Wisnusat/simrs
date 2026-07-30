import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAuth, isGuardError } from '@/lib/api/guards'
import { syncInvoiceForEncounter } from '@/lib/api/invoice-builder'
import { enqueueSync } from '@/lib/satusehat/queue'
import * as Sentry from '@sentry/nextjs'

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

interface OutcomeBody {
    outcome: 'discharged' | 'referred' | 'admitted_inpatient'
    referred_to?: string
    referral_letter_no?: string
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
    const rl = await rateLimit(request, 'emergency:outcome', RATE_LIMITS.write)
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

        // Ambil emergency encounter
        const { data: existing, error: findError } = await supabase
            .from('emergency_encounters')
            .select('id, patient_id, encounter_id, outcome')
            .eq('id', id)
            .single()

        if (findError || !existing) {
            return apiResponse.notFound('IGD encounter not found')
        }

        // Fetch organization_id dari encounters (join terpisah untuk hindari ambiguitas FK)
        const { data: encounterCtx } = await supabase
            .from('encounters')
            .select('organization_id')
            .eq('id', existing.encounter_id)
            .single()

        const body = (await request.json()) as OutcomeBody
        const { outcome, referred_to, referral_letter_no } = body

        const allowedOutcomes: OutcomeBody['outcome'][] = ['discharged', 'referred', 'admitted_inpatient']
        if (!outcome || !allowedOutcomes.includes(outcome)) {
            return apiResponse.badRequest(`outcome must be one of: ${allowedOutcomes.join(', ')}`)
        }

        const now = new Date()

        // Update emergency_encounters outcome & status
        const emergencyStatus =
            outcome === 'admitted_inpatient' ? 'admitted_to_inpatient' :
            outcome === 'referred' ? 'referred_out' :
            'completed'

        const emergencyUpdates: Record<string, unknown> = {
            outcome,
            status: emergencyStatus,
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
            Sentry.captureException(updateEmergencyError)
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

        let episodeId: string | null = null

        if (outcome === 'admitted_inpatient') {
            const orgId: string | undefined = encounterCtx?.organization_id
            if (!orgId) {
                console.error('Missing organization_id for inpatient admission')
                Sentry.captureMessage('Missing organization_id for inpatient admission', 'error')
                return apiResponse.serverError('Organization context not found for inpatient admission')
            }

            const startDate = now.toISOString().slice(0, 10) // YYYY-MM-DD

            // Buat episode_of_care tanpa kamar — perawat akan assign kamar via /api/admission-requests
            const { data: episode, error: episodeError } = await supabase
                .from('episodes_of_care')
                .insert({
                    patient_id: existing.patient_id,
                    organization_id: orgId,
                    start_date: startDate,
                    status: 'admitted',
                    dpjp_id: practitioner.id,
                })
                .select('id')
                .single()

            if (episodeError || !episode) {
                console.error('Episode of care create error:', episodeError)
                Sentry.captureException(episodeError)
                return apiResponse.serverError('Failed to create episode of care')
            }

            episodeId = episode.id
            enqueueSync(supabase, 'EpisodeOfCare', episode.id).catch(() => {})
        }

        // Generate invoice for non-inpatient outcomes (discharged/referred)
        if (outcome !== 'admitted_inpatient') {
            syncInvoiceForEncounter(supabase, existing.encounter_id).catch(err => {
                console.error('Invoice sync error on emergency outcome:', err)
                Sentry.captureException(err)
            })
        }

        return apiResponse.ok({
            outcome,
            episode_id: episodeId,
            emergency_id: updatedEmergency.id,
        })
    } catch {
        return apiResponse.serverError()
    }
}
