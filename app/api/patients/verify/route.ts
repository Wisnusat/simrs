import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAuth, isGuardError } from '@/lib/api/guards'
import { encryptData } from '@/lib/encryption'

/**
 * POST /api/patients/verify
 * Verifies NIK and returns minimal encrypted patient data.
 * Can be accessed via 'x-api-key' header bypass.
 */
export async function POST(request: NextRequest) {
    const rl = rateLimit(request, 'patients:verify', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const standardSupabase = await createClient()
        // requireAuth accepts `request` to allow the API Key bypass check
        const auth = await requireAuth(standardSupabase, request)
        if (isGuardError(auth)) return auth

        // To bypass RLS, we must use an admin client if available
        let supabase = standardSupabase
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (serviceKey && process.env.NEXT_PUBLIC_SUPABASE_URL) {
            const { createClient: createAdminClient } = await import('@supabase/supabase-js')
            supabase = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey)
        }

        const body = await request.json().catch(() => ({}))
        const { nik } = body

        if (!nik || typeof nik !== 'string') {
            return apiResponse.badRequest('Valid NIK is required')
        }

        const { data: patient, error } = await supabase
            .from('patients')
            .select('id, nik, full_name, date_of_birth, gender')
            .eq('nik', nik)
            // .eq('is_active', true) // Note: uncomment this only if all active patients truly have is_active=true
            .maybeSingle()

        if (error) {
            console.error('Supabase query error:', error)
            return apiResponse.serverError(`Database error: ${error.message} (Is your SUPABASE_SERVICE_ROLE_KEY missing?)`)
        }

        if (!patient) {
            return apiResponse.notFound('Patient not found')
        }

        const encryptedData = encryptData(patient)

        return apiResponse.ok({
            encrypted_payload: encryptedData,
        })
    } catch (err: any) {
        console.error('Patient verify error:', err)
        return apiResponse.serverError()
    }
}
