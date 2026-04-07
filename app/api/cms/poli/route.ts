import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'

/**
 * GET /api/cms/poli
 * Returns all active poli services.
 * Auth: None (public — used on hospital info page and booking)
 */
export async function GET(request: NextRequest) {
    const rl = rateLimit(request, 'cms:poli:list', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()

        const { data: poliServices, error } = await supabase
            .from('poli_services')
            .select(`
                id,
                name,
                code,
                speciality_code,
                quota_per_day,
                is_active,
                ss_healthcare_service_id,
                location_id,
                locations (
                    id,
                    name,
                    floor
                )
            `)
            .eq('is_active', true)
            .order('name', { ascending: true })

        if (error) {
            console.error('Poli services fetch error:', error)
            return apiResponse.serverError('Failed to fetch poli services')
        }

        return apiResponse.ok(poliServices)
    } catch {
        return apiResponse.serverError()
    }
}

/**
 * POST /api/cms/poli
 * Creates a new poli service.
 * Auth: Admin role only
 */
export async function POST(request: NextRequest) {
    const rl = rateLimit(request, 'cms:poli:create', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const admin = await requireAdmin(supabase)
        if (isGuardError(admin)) return admin

        const body = await request.json()
        const { name, code, location_id, speciality_code, quota_per_day } = body

        if (!name || !code || !location_id) {
            return apiResponse.badRequest('name, code, and location_id are required')
        }

        if (quota_per_day !== undefined && (typeof quota_per_day !== 'number' || quota_per_day < 1)) {
            return apiResponse.badRequest('quota_per_day must be a positive number')
        }

        const { data: newPoli, error: insertError } = await supabase
            .from('poli_services')
            .insert({
                organization_id: admin.practitioner.organization_id,
                name,
                code: code.toUpperCase(),
                location_id,
                speciality_code: speciality_code ?? null,
                quota_per_day: quota_per_day ?? 30,
                is_active: true,
            })
            .select()
            .single()

        if (insertError) {
            console.error('Poli insert error:', insertError)
            if (insertError.code === '23505') {
                return apiResponse.conflict('Code already exists')
            }
            return apiResponse.serverError('Failed to create poli service')
        }

        return apiResponse.created(newPoli)
    } catch {
        return apiResponse.serverError()
    }
}
