import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAuth, isGuardError } from '@/lib/api/guards'
import { enqueueSync } from '@/lib/satusehat/queue'
import * as Sentry from '@sentry/nextjs'

type RouteContext = { params: Promise<{ id: string }> }

// Reuse same pattern as other emergency handlers
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

interface TriageBody {
    triage_category: string
    triage_complaint: string
    is_critical?: boolean
    resuscitation_notes?: string
    needs_ambulance?: boolean
    systolic_bp?: number
    heart_rate?: number
    temperature?: number
    oxygen_saturation?: number
}

/**
 * PATCH /api/emergency/[id]/triage
 * Update triage information for an emergency encounter.
 * - Sets triage_category (P1/P2/P3/P4) and related fields
 * - Records triage performer and timestamp
 * - Moves emergency status to "in_triage" and encounter to in_progress
 * Auth: Nurse only.
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
    const rl = await rateLimit(request, 'emergency:triage', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAuth(supabase)
        if (isGuardError(auth)) return auth

        const practitioner = await getCurrentPractitioner(Promise.resolve(supabase))
        if (!practitioner) {
            return apiResponse.forbidden('Staff only')
        }

        // Hanya perawat yang boleh melakukan triase sesuai spesifikasi API
        if (practitioner.role !== 'nurse') {
            return apiResponse.forbidden('Only nurse can perform triage')
        }

        const { id } = await context.params

        // Ensure record exists and get encounter_id + patient_id
        const { data: existing, error: findError } = await supabase
            .from('emergency_encounters')
            .select('id, encounter_id, patient_id')
            .eq('id', id)
            .single()

        if (findError || !existing) {
            return apiResponse.notFound('Emergency encounter not found')
        }

        const body = (await request.json()) as Partial<TriageBody>
        const {
            triage_category,
            triage_complaint,
            is_critical,
            resuscitation_notes,
            needs_ambulance,
            systolic_bp,
            heart_rate,
            temperature,
            oxygen_saturation,
        } = body

        if (!triage_category) {
            return apiResponse.badRequest('triage_category is required')
        }

        if (!triage_complaint) {
            return apiResponse.badRequest('triage_complaint is required')
        }

        const allowedCategories = ['P1', 'P2', 'P3', 'P4']
        if (!allowedCategories.includes(triage_category)) {
            return apiResponse.badRequest(`triage_category must be one of: ${allowedCategories.join(', ')}`)
        }

        const updates: Record<string, unknown> = {
            triage_category,
            triage_complaint,
            triage_nurse_id: practitioner.id,
            triaged_at: new Date().toISOString(),
            status: 'in_triage',
        }
        if (is_critical !== undefined) updates.is_critical = is_critical
        if (resuscitation_notes !== undefined) updates.resuscitation_notes = resuscitation_notes
        if (needs_ambulance !== undefined) updates.needs_ambulance = needs_ambulance

        updates.updated_at = new Date().toISOString()

        const { data: updated, error: updateError } = await supabase
            .from('emergency_encounters')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (updateError || !updated) {
            console.error('Emergency triage update error:', updateError)
            Sentry.captureException(updateError)
            return apiResponse.serverError('Failed to update triage data')
        }

        // Keep base encounter status in sync (in triage -> in_progress)
        const { error: encounterUpdateError } = await supabase
            .from('encounters')
            .update({ status: 'in_progress' })
            .eq('id', existing.encounter_id)

        if (encounterUpdateError) {
            console.warn('Encounter status sync error (triage):', encounterUpdateError)
        }

        enqueueSync(supabase, 'Encounter', existing.encounter_id, 'PUT').catch(() => {})

        // Jika ada vital signs yang dikirim, rekam ke tabel vital_signs
        const hasVitals =
            systolic_bp !== undefined ||
            heart_rate !== undefined ||
            temperature !== undefined ||
            oxygen_saturation !== undefined

        if (hasVitals) {
            const { data: vsRow, error: vitalsError } = await supabase
                .from('vital_signs')
                .insert({
                    encounter_id: existing.encounter_id,
                    patient_id: existing.patient_id,
                    recorded_by: practitioner.id,
                    systolic_bp: systolic_bp ?? null,
                    diastolic_bp: null,
                    heart_rate: heart_rate ?? null,
                    respiratory_rate: null,
                    temperature: temperature ?? null,
                    oxygen_saturation: oxygen_saturation ?? null,
                })
                .select('id')
                .single()

            if (vitalsError) {
                console.warn('Vital signs insert error (triage):', vitalsError)
            } else if (vsRow) {
                enqueueSync(supabase, 'Observation', vsRow.id).catch(() => {})
            }
        }

        return apiResponse.ok(updated)
    } catch {
        return apiResponse.serverError()
    }
}
