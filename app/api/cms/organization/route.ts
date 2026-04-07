import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAuth, requireAdmin, isGuardError } from '@/lib/api/guards'

/**
 * GET /api/cms/organization
 * Returns the organization profile including poli list and operational hours.
 * Auth: Required (any authenticated staff)
 */
export async function GET(request: NextRequest) {
    const rl = rateLimit(request, 'cms:org:get', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAuth(supabase)
        if (isGuardError(auth)) return apiResponse.forbidden()

        const { data: organization, error } = await supabase
            .from('organizations')
            .select(`
                id,
                name,
                type,
                address,
                phone,
                email,
                head_name,
                operational_hours,
                logo_url,
                ss_organization_id,
                is_active,
                created_at,
                updated_at,
                poli_services (
                    id,
                    name,
                    code,
                    speciality_code,
                    quota_per_day,
                    is_active,
                    ss_healthcare_service_id
                )
            `)
            .eq('is_active', true)
            .order('created_at', { referencedTable: 'poli_services', ascending: true })
            .single()

        if (error || !organization) {
            return apiResponse.notFound('Organization not found')
        }

        return apiResponse.ok(organization)
    } catch {
        return apiResponse.serverError()
    }
}

/**
 * PUT /api/cms/organization
 * Updates clinic name, address, contact, operational hours.
 * Auth: Admin role only
 */
export async function PUT(request: NextRequest) {
    const rl = rateLimit(request, 'cms:org:update', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const admin = await requireAdmin(supabase)
        if (isGuardError(admin)) return admin

        const body = await request.json()
        const { name, address, phone, email, head_name, operational_hours } = body

        const updates: Record<string, unknown> = {}
        if (name !== undefined) updates.name = name
        if (address !== undefined) updates.address = address
        if (phone !== undefined) updates.phone = phone
        if (email !== undefined) updates.email = email
        if (head_name !== undefined) updates.head_name = head_name
        if (operational_hours !== undefined) {
            if (typeof operational_hours !== 'object' || Array.isArray(operational_hours)) {
                return apiResponse.badRequest('operational_hours must be a JSON object')
            }
            updates.operational_hours = operational_hours
        }

        if (Object.keys(updates).length === 0) {
            return apiResponse.badRequest('No valid fields provided for update')
        }

        updates.updated_at = new Date().toISOString()

        const { data: updatedOrganization, error: updateError } = await supabase
            .from('organizations')
            .update(updates)
            .eq('id', admin.practitioner.organization_id)
            .select()
            .single()

        if (updateError) {
            console.error('Organization update error:', updateError)
            return apiResponse.serverError('Failed to update organization')
        }

        return apiResponse.ok(updatedOrganization)
    } catch {
        return apiResponse.serverError()
    }
}
