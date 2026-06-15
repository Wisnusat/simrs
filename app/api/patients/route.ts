import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAuth, isGuardError } from '@/lib/api/guards'

/**
 * GET /api/patients
 * List patients with optional search (name, NIK, MR no, BPJS no) and pagination.
 * Auth: Staff
 */
export async function GET(request: NextRequest) {
    const rl = await rateLimit(request, 'patients:list', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAuth(supabase)
        if (isGuardError(auth)) return auth

        const { searchParams } = new URL(request.url)
        const search = searchParams.get('search') ?? ''
        const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
        const offset = (page - 1) * limit

        let query = supabase
            .from('patients')
            .select(
                'id, full_name, nik, bpjs_no, medical_record_no, date_of_birth, gender, phone, address, blood_type, emergency_contact_name, emergency_contact_phone, ss_patient_id, created_at',
                { count: 'exact' }
            )
            .eq('is_active', true)

        if (search) {
            query = query.or(
                `full_name.ilike.%${search}%,nik.ilike.%${search}%,medical_record_no.ilike.%${search}%,bpjs_no.ilike.%${search}%`
            )
        }

        const { data: patients, error, count } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (error) {
            console.error('Patients fetch error:', error)
            return apiResponse.serverError('Failed to fetch patients')
        }

        return apiResponse.ok(patients, { total: count ?? 0, page, limit })
    } catch {
        return apiResponse.serverError()
    }
}

/**
 * POST /api/patients
 * Register a new patient. Auto-generates medical_record_no.
 * Auth: Staff
 */
export async function POST(request: NextRequest) {
    const rl = await rateLimit(request, 'patients:create', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAuth(supabase)
        if (isGuardError(auth)) return auth

        const body = await request.json()
        const {
            nik, bpjs_no, full_name, date_of_birth, gender,
            phone, address, blood_type,
            emergency_contact_name, emergency_contact_phone,
        } = body

        if (!full_name || !date_of_birth || !gender) {
            return apiResponse.badRequest('full_name, date_of_birth, and gender are required')
        }

        const validGenders = ['male', 'female', 'other']
        if (!validGenders.includes(gender)) {
            return apiResponse.badRequest(`gender must be one of: ${validGenders.join(', ')}`)
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth)) {
            return apiResponse.badRequest('date_of_birth must be in YYYY-MM-DD format')
        }

        // Fetch practitioner profile to get organization_id
        const { data: practitioner, error: practitionerError } = await supabase
            .from('practitioners')
            .select('organization_id')
            .eq('user_id', auth.user.id)
            .eq('is_active', true)
            .single()

        if (practitionerError || !practitioner) {
            return apiResponse.forbidden('Practitioner profile not found')
        }

        // Auto-generate medical_record_no
        const { data: mrData, error: mrError } = await supabase
            .rpc('generate_medical_record_no', { p_org_id: practitioner.organization_id })

        if (mrError || !mrData) {
            return apiResponse.serverError('Failed to generate medical record number')
        }
        const medical_record_no = mrData as string

        // Satu Sehat MPI lookup placeholder
        let ss_patient_id: string | null = null
        if (nik) {
            try {
                // TODO: replace with actual MPI API call when credentials are available
                ss_patient_id = null
            } catch (mpiError) {
                console.warn('Satu Sehat MPI lookup failed:', mpiError)
            }
        }

        const { data: newPatient, error: insertError } = await supabase
            .from('patients')
            .insert({
                nik: nik ?? null,
                bpjs_no: bpjs_no ?? null,
                full_name,
                date_of_birth,
                gender,
                phone: phone ?? null,
                address: address ?? null,
                blood_type: blood_type ?? null,
                emergency_contact_name: emergency_contact_name ?? null,
                emergency_contact_phone: emergency_contact_phone ?? null,
                medical_record_no,
                ss_patient_id,
            })
            .select()
            .single()

        if (insertError) {
            console.error('Patient insert error:', insertError)
            if (insertError.code === '23505') {
                return apiResponse.conflict('A patient with this NIK or BPJS number already exists')
            }
            return apiResponse.serverError('Failed to register patient')
        }

        return apiResponse.created(newPatient)
    } catch {
        return apiResponse.serverError()
    }
}
