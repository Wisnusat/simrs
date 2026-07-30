import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAuth, isGuardError } from '@/lib/api/guards'
import { syncInvoiceForEncounter } from '@/lib/api/invoice-builder'
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

/**
 * GET /api/emergency/[id]
 * Detail of a single emergency encounter.
 * Auth: Patient (self) or any staff in organization (RLS ensures rows).
 */
export async function GET(request: NextRequest, context: RouteContext) {
    const rl = await rateLimit(request, 'emergency:get', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAuth(supabase)
        if (isGuardError(auth)) return auth

        const { id } = await context.params

        const { data, error } = await supabase
            .from('emergency_encounters')
            .select(`
                id,
                encounter_id,
                patient_id,
                status,
                triage_category,
                triage_complaint,
                triage_nurse_id,
                triaged_at,
                is_critical,
                resuscitation_notes,
                outcome,
                referred_to,
                referral_letter_no,
                needs_ambulance,
                created_at,
                updated_at,
                patients:patient_id (
                    id,
                    full_name,
                    medical_record_no,
                    nik,
                    bpjs_no,
                    date_of_birth,
                    gender
                ),
                encounters:encounter_id (
                    id,
                    status,
                    encounter_class,
                    arrived_at,
                    started_at,
                    finished_at,
                    doctor_id,
                    nurse_id
                )
            `)
            .eq('id', id)
            .single()

        if (error || !data) {
            return apiResponse.notFound('Emergency encounter not found')
        }

        return apiResponse.ok(data)
    } catch {
        return apiResponse.serverError()
    }
}

interface UpdateEmergencyBody {
    status?: string
    triage_category?: string
    triage_complaint?: string
    resuscitation_notes?: string
    outcome?: string
    referred_to?: string
    referral_letter_no?: string
    is_critical?: boolean
    needs_ambulance?: boolean
}

/**
 * PATCH /api/emergency/[id]
 * Update emergency encounter (status, triage info, outcome).
 * Auth: Nurse / Doctor / Admin.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
    const rl = await rateLimit(request, 'emergency:update', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAuth(supabase)
        if (isGuardError(auth)) return auth

        const practitioner = await getCurrentPractitioner(Promise.resolve(supabase))
        if (!practitioner) {
            return apiResponse.forbidden('Staff only')
        }

        const allowedRoles = ['nurse', 'doctor', 'admin']
        if (!allowedRoles.includes(practitioner.role)) {
            return apiResponse.forbidden('Only nurse, doctor, or admin can update emergency encounters')
        }

        const { id } = await context.params

        // Ensure record exists and get encounter_id
        const { data: existing, error: findError } = await supabase
            .from('emergency_encounters')
            .select('id, encounter_id')
            .eq('id', id)
            .single()

        if (findError || !existing) {
            return apiResponse.notFound('Emergency encounter not found')
        }

        const body = (await request.json()) as Partial<UpdateEmergencyBody>
        const {
            status,
            triage_category,
            triage_complaint,
            resuscitation_notes,
            outcome,
            referred_to,
            referral_letter_no,
            is_critical,
            needs_ambulance,
        } = body

        const updates: Record<string, unknown> = {}
        if (status !== undefined) updates.status = status
        if (triage_category !== undefined) updates.triage_category = triage_category
        if (triage_complaint !== undefined) updates.triage_complaint = triage_complaint
        if (resuscitation_notes !== undefined) updates.resuscitation_notes = resuscitation_notes
        if (outcome !== undefined) updates.outcome = outcome
        if (referred_to !== undefined) updates.referred_to = referred_to
        if (referral_letter_no !== undefined) updates.referral_letter_no = referral_letter_no
        if (is_critical !== undefined) updates.is_critical = is_critical
        if (needs_ambulance !== undefined) updates.needs_ambulance = needs_ambulance

        if (Object.keys(updates).length === 0) {
            return apiResponse.badRequest('No valid fields provided for update')
        }

        updates.updated_at = new Date().toISOString()

        const { data: updated, error: updateError } = await supabase
            .from('emergency_encounters')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (updateError || !updated) {
            console.error('Emergency encounter update error:', updateError)
            Sentry.captureException(updateError)
            return apiResponse.serverError('Failed to update emergency encounter')
        }

        // Optionally align base encounter status with emergency status
        if (status) {
            let encounterStatus: 'in_progress' | 'finished' | undefined
            const finishedStatuses = ['completed', 'referred_out', 'admitted_to_inpatient']
            if (finishedStatuses.includes(status)) {
                encounterStatus = 'finished'
            } else if (status === 'in_triage' || status === 'in_treatment' || status === 'emergency_admitted') {
                encounterStatus = 'in_progress'
            }

            if (encounterStatus) {
                const { error: encounterUpdateError } = await supabase
                    .from('encounters')
                    .update({ status: encounterStatus, finished_at: encounterStatus === 'finished' ? new Date().toISOString() : null })
                    .eq('id', existing.encounter_id)

                if (encounterUpdateError) {
                    console.warn('Encounter status sync error:', encounterUpdateError)
                }

                if (encounterStatus === 'finished') {
                    // Sync invoice lazily. Import is done at the top.
                    syncInvoiceForEncounter(supabase, existing.encounter_id).catch(err => {
                        console.error('Invoice sync error on emergency finish:', err)
                        Sentry.captureException(err)
                    })
                }
            }
        }

        return apiResponse.ok(updated)
    } catch {
        return apiResponse.serverError()
    }
}
