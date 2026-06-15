import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requireAdmin, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

/**
 * GET /api/cms/lab-services
 * Returns all lab services for the organization.
 */
export async function GET(req: NextRequest) {
    const rl = await rateLimit(req, 'cms:lab-services:list', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

    const supabase = await createClient()
    const auth = await requireAdmin(supabase)
    if (isGuardError(auth)) return auth

    const { data, error } = await supabase
        .from('lab_services')
        .select('*')
        .eq('organization_id', auth.practitioner.organization_id)
        .order('category', { ascending: true })
        .order('name', { ascending: true })

    if (error) return apiResponse.serverError(error.message)
    return apiResponse.ok(data)
}

/**
 * POST /api/cms/lab-services
 * Adds a lab service (from master_lab_services) to the organization's lab_services.
 * Body: { master_id: string } — the id from master_lab_services
 */
export async function POST(req: NextRequest) {
    const rl = await rateLimit(req, 'cms:lab-services:create', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

    const supabase = await createClient()
    const auth = await requireAdmin(supabase)
    if (isGuardError(auth)) return auth

    const body = await req.json().catch(() => null)
    if (!body?.master_id) return apiResponse.badRequest('master_id is required')

    // Fetch the master record
    const { data: master, error: masterErr } = await supabase
        .from('master_lab_services')
        .select('*')
        .eq('id', body.master_id)
        .single()

    if (masterErr || !master) return apiResponse.notFound('Master lab service not found')

    // Check for duplicate (same loinc_code in the same org)
    const { data: existing } = await supabase
        .from('lab_services')
        .select('id')
        .eq('organization_id', auth.practitioner.organization_id)
        .eq('loinc_code', master.loinc_code)
        .single()

    if (existing) return apiResponse.conflict('Layanan lab ini sudah ditambahkan')

    const { data, error } = await supabase
        .from('lab_services')
        .insert({
            organization_id: auth.practitioner.organization_id,
            name: master.name,
            loinc_code: master.loinc_code,
            category: master.category,
            is_active: true,
        })
        .select()
        .single()

    if (error) return apiResponse.serverError(error.message)
    return apiResponse.created(data)
}

/**
 * DELETE /api/cms/lab-services
 * Removes a lab service from the organization.
 * Body: { id: string } — the id from lab_services
 */
export async function DELETE(req: NextRequest) {
    const rl = await rateLimit(req, 'cms:lab-services:delete', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

    const supabase = await createClient()
    const auth = await requireAdmin(supabase)
    if (isGuardError(auth)) return auth

    const body = await req.json().catch(() => null)
    if (!body?.id) return apiResponse.badRequest('id is required')

    const { error } = await supabase
        .from('lab_services')
        .delete()
        .eq('id', body.id)
        .eq('organization_id', auth.practitioner.organization_id)

    if (error) return apiResponse.serverError(error.message)
    return apiResponse.ok({ deleted: true })
}
