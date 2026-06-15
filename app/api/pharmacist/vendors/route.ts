import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'

/**
 * GET /api/pharmacist/vendors
 * Lists active vendors for the organization
 */
export async function GET(request: NextRequest) {
    const rl = await rateLimit(request, 'pharmacist:vendors', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAdmin(supabase)
        if (isGuardError(auth)) return auth

        const { data, error } = await supabase
            .from('vendors')
            .select('id, name, contact_person, phone, email')
            .eq('organization_id', auth.practitioner.organization_id)
            .eq('is_active', true)
            .order('name')

        if (error) return apiResponse.serverError('Failed to fetch vendors')
        return apiResponse.ok(data ?? [])
    } catch {
        return apiResponse.serverError()
    }
}
