import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requireAdmin, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

/**
 * GET /api/cms/master-lab-services
 * Returns master_lab_services with optional search + pagination.
 *
 * Query params:
 *   q         — search by name or loinc_code (case-insensitive)
 *   category  — filter by category
 *   page      — 1-based (default 1)
 *   limit     — per page (default 20, max 100)
 */
export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, 'cms:master-lab-services:list', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

    const supabase = await createClient()
    const auth = await requireAdmin(supabase)
    if (isGuardError(auth)) return auth

    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim() ?? ''
    const category = searchParams.get('category')?.trim() ?? ''
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
    const from = (page - 1) * limit
    const to = from + limit - 1

    let query = supabase
        .from('master_lab_services')
        .select('id, name, category, loinc_code, loinc_display, specimen_type, unit_local, result_type', { count: 'exact' })
        .order('category', { ascending: true })
        .order('name', { ascending: true })
        .range(from, to)

    if (q) {
        query = query.or(`name.ilike.%${q}%,loinc_code.ilike.%${q}%,loinc_display.ilike.%${q}%`)
    }
    if (category) {
        query = query.eq('category', category)
    }

    const { data, error, count } = await query

    if (error) return apiResponse.serverError(error.message)
    return apiResponse.ok(data, { total: count ?? 0, page, limit })
}
