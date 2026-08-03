import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAuth, isGuardError } from '@/lib/api/guards'
import * as Sentry from '@sentry/nextjs'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/patients/[id]
 * Returns full patient profile including allergy list and latest encounter summary.
 * Auth: Staff / Self
 */
export async function GET(request: NextRequest, context: RouteContext) {
    const rl = await rateLimit(request, 'patients:get', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAuth(supabase)
        if (isGuardError(auth)) return auth

        const { id } = await context.params

        // Fetch patient with allergies and latest encounter
        const { data: patient, error } = await supabase
            .from('patients')
            .select(`
                id,
                full_name,
                nik,
                bpjs_no,
                medical_record_no,
                date_of_birth,
                gender,
                phone,
                address,
                blood_type,
                emergency_contact_name,
                emergency_contact_phone,
                ss_patient_id,
                created_at,
                allergy_intolerances (
                    id,
                    substance_display,
                    criticality,
                    reaction_description,
                    onset_date
                ),
                encounters (
                    id,
                    encounter_date:created_at,
                    status
                )
            `)
            .eq('id', id)
            .order('created_at', { referencedTable: 'encounters', ascending: false })
            .limit(1, { referencedTable: 'encounters' })
            .single()

        if (error || !patient) {
            return apiResponse.notFound('Patient not found')
        }

        const encounters = patient.encounters as Array<{ id: string; encounter_date: string; status: string }> | null
        const last_visit = encounters?.[0]?.encounter_date ?? null

        return apiResponse.ok({
            ...patient,
            allergies: patient.allergy_intolerances ?? [],
            last_visit,
            // remove the raw relation keys from top-level
            allergy_intolerances: undefined,
            encounters: undefined,
        })
    } catch {
        return apiResponse.serverError()
    }
}

/**
 * PUT /api/patients/[id]
 * Updates patient demographic data. NIK and medical_record_no are immutable.
 * Auth: Staff
 */
export async function PUT(request: NextRequest, context: RouteContext) {
    const rl = await rateLimit(request, 'patients:update', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAuth(supabase)
        if (isGuardError(auth)) return auth

        const { id } = await context.params

        const { data: existing, error: findError } = await supabase
            .from('patients')
            .select('id')
            .eq('id', id)
            .single()

        if (findError || !existing) {
            return apiResponse.notFound('Patient not found')
        }

        const body = await request.json()
        const {
            full_name, phone, address, bpjs_no, blood_type,
            emergency_contact_name, emergency_contact_phone,
            gender, date_of_birth,
        } = body

        const updates: Record<string, unknown> = {}
        if (full_name !== undefined) updates.full_name = full_name
        if (phone !== undefined) updates.phone = phone
        if (address !== undefined) updates.address = address
        if (bpjs_no !== undefined) updates.bpjs_no = bpjs_no
        if (blood_type !== undefined) updates.blood_type = blood_type
        if (emergency_contact_name !== undefined) updates.emergency_contact_name = emergency_contact_name
        if (emergency_contact_phone !== undefined) updates.emergency_contact_phone = emergency_contact_phone

        if (gender !== undefined) {
            const validGenders = ['male', 'female', 'other']
            if (!validGenders.includes(gender)) {
                return apiResponse.badRequest(`gender must be one of: ${validGenders.join(', ')}`)
            }
            updates.gender = gender
        }

        if (date_of_birth !== undefined) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth)) {
                return apiResponse.badRequest('date_of_birth must be in YYYY-MM-DD format')
            }
            updates.date_of_birth = date_of_birth
        }

        if (Object.keys(updates).length === 0) {
            return apiResponse.badRequest('No valid fields provided for update')
        }

        const { data: updatedPatient, error: updateError } = await supabase
            .from('patients')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (updateError) {
            console.error('Patient update error:', updateError)
            Sentry.captureException(updateError)
            if (updateError.code === '23505') {
                return apiResponse.conflict('A patient with this BPJS number already exists')
            }
            return apiResponse.serverError('Failed to update patient')
        }

        return apiResponse.ok(updatedPatient)
    } catch {
        return apiResponse.serverError()
    }
}
