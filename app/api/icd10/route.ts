import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'

/**
 * GET /api/icd10
 * Autocomplete search for ICD-10 diagnoses.
 * Query: ?search=... (minimum 3 characters, filters by code or name_id)
 */
export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, 'icd10:get', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

    const supabase = await createClient()
    const auth = await requirePractitioner(supabase)
    if (isGuardError(auth)) return auth

    const search = new URL(req.url).searchParams.get('search') ?? ''

    if (!search || search.trim().length < 3) {
        return apiResponse.ok([])
    }

    const cleanSearch = search.trim()

    const { data: icdList, error } = await supabase
        .from('master_icd10')
        .select('code, name_en, name_id')
        .or(`code.ilike.%${cleanSearch}%,name_id.ilike.%${cleanSearch}%`)
        .order('code')
        .limit(50)

    if (error) {
        return apiResponse.serverError(error.message)
    }

    return apiResponse.ok(icdList ?? [])
}
