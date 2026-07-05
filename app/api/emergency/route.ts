import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAuth, isGuardError } from '@/lib/api/guards'
import { enqueueSync } from '@/lib/satusehat/queue'

/**
 * Helper: resolve current practitioner (staff) from authenticated user.
 * Used to restrict access to staff-only operations.
 */
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
 * GET /api/emergency
 * List emergency encounters (IGD) for staff.
 * Auth: Staff only (any active practitioner in an organization).
 */
export async function GET(request: NextRequest) {
    const rl = await rateLimit(request, 'emergency:list', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAuth(supabase)
        if (isGuardError(auth)) return auth

        const practitioner = await getCurrentPractitioner(Promise.resolve(supabase))
        if (!practitioner) {
            return apiResponse.forbidden('Staff only')
        }

        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status') ?? ''
        const search = searchParams.get('search') ?? ''
        const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
        const offset = (page - 1) * limit

        let query = supabase
            .from('emergency_encounters')
            .select(
                `
                id,
                encounter_id,
                patient_id,
                status,
                triage_category,
                triage_complaint,
                is_critical,
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
                )
            `,
                { count: 'exact' }
            )
            .order('created_at', { ascending: false })

        if (status) {
            query = query.eq('status', status)
        }

        if (search) {
            query = query.or(
                `patients(full_name.ilike.%${search}%),patients(medical_record_no.ilike.%${search}%),patients(nik.ilike.%${search}%),patients(bpjs_no.ilike.%${search}%)`
            )
        }

        const { data, error, count } = await query.range(offset, offset + limit - 1)

        if (error) {
            console.error('Emergency encounters fetch error:', error)
            return apiResponse.serverError('Failed to fetch emergency encounters')
        }

        return apiResponse.ok(data ?? [], { total: count ?? 0, page, limit })
    } catch {
        return apiResponse.serverError()
    }
}

interface CreateEmergencyBody {
    patient_id: string
    triage_category?: string
    triage_complaint?: string
    is_critical?: boolean
    needs_ambulance?: boolean
}

/**
 * POST /api/emergency
 * Create a new emergency encounter (IGD intake + emergency_encounters).
 * Auth: Nurse / Doctor (admin tidak boleh create encounter klinis).
 */
export async function POST(request: NextRequest) {
    const rl = await rateLimit(request, 'emergency:create', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAuth(supabase)
        if (isGuardError(auth)) return auth

        const practitioner = await getCurrentPractitioner(Promise.resolve(supabase))
        if (!practitioner) {
            return apiResponse.forbidden('Staff only')
        }

        // Hanya tenaga klinis (perawat/dokter) yang boleh membuat encounter IGD
        const allowedRoles = ['nurse', 'doctor']
        if (!allowedRoles.includes(practitioner.role)) {
            return apiResponse.forbidden('Only nurse or doctor can create emergency encounters')
        }

        const body = (await request.json()) as Partial<CreateEmergencyBody>
        const { patient_id, triage_category, triage_complaint, is_critical, needs_ambulance } = body

        if (!patient_id) {
            return apiResponse.badRequest('patient_id is required')
        }

        // Ensure patient exists
        const { data: patient, error: patientError } = await supabase
            .from('patients')
            .select('id')
            .eq('id', patient_id)
            .single()

        if (patientError || !patient) {
            return apiResponse.notFound('Patient not found')
        }

        // Create core Encounter with class = emergency
        const { data: encounter, error: encounterError } = await supabase
            .from('encounters')
            .insert({
                patient_id,
                organization_id: practitioner.organization_id,
                encounter_class: 'emergency',
                status: 'arrived',
                nurse_id: practitioner.role === 'nurse' ? practitioner.id : null,
                doctor_id: practitioner.role === 'doctor' ? practitioner.id : null,
                arrived_at: new Date().toISOString(),
            })
            .select('id')
            .single()

        if (encounterError || !encounter) {
            console.error('Encounter create error:', encounterError)
            return apiResponse.serverError('Failed to create encounter')
        }

        // Create emergency_encounters record
        const { data: emergency, error: emergencyError } = await supabase
            .from('emergency_encounters')
            .insert({
                encounter_id: encounter.id,
                patient_id,
                status: 'emergency_admitted',
                triage_category: triage_category ?? null,
                triage_complaint: triage_complaint ?? null,
                triage_nurse_id: practitioner.role === 'nurse' ? practitioner.id : null,
                triaged_at: triage_category || triage_complaint ? new Date().toISOString() : null,
                is_critical: is_critical ?? false,
                needs_ambulance: needs_ambulance ?? false,
            })
            .select()
            .single()

        if (emergencyError || !emergency) {
            console.error('Emergency encounter create error:', emergencyError)
            return apiResponse.serverError('Failed to create emergency encounter')
        }

        enqueueSync(supabase, 'Encounter', encounter.id).catch(() => {})

        return apiResponse.created(emergency)
    } catch {
        return apiResponse.serverError()
    }
}
