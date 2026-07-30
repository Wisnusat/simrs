import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'
import * as Sentry from '@sentry/nextjs'

interface RouteContext {
    params: Promise<{ id: string }>
}

/**
 * GET /api/cms/staff/[id]
 */
export async function GET(request: NextRequest, ctx: RouteContext) {
    const rl = await rateLimit(request, 'cms:staff:get', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const admin = await requireAdmin(supabase)
        if (isGuardError(admin)) return admin

        const { id } = await ctx.params

        const { data: staff, error } = await supabase
            .from('practitioners')
            .select('*')
            .eq('id', id)
            .eq('organization_id', admin.practitioner.organization_id)
            .single()

        if (error || !staff) {
            return apiResponse.notFound('Staff member not found')
        }

        return apiResponse.ok(staff)
    } catch {
        return apiResponse.serverError()
    }
}

/**
 * PATCH /api/cms/staff/[id]
 * Update staff details or toggle active status.
 */
export async function PATCH(request: NextRequest, ctx: RouteContext) {
    const rl = await rateLimit(request, 'cms:staff:update', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const admin = await requireAdmin(supabase)
        if (isGuardError(admin)) return admin

        const { id } = await ctx.params
        const body = await request.json()

        const allowedFields = [
            'full_name', 'role', 'specialization', 'gender', 'phone',
            'email', 'nik', 'nip', 'str_number', 'sip_number', 'is_active'
        ]

        const updates: Record<string, unknown> = {}
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updates[field] = body[field]
            }
        }

        if (Object.keys(updates).length === 0) {
            return apiResponse.badRequest('No valid fields provided for update')
        }

        updates.updated_at = new Date().toISOString()

        const { data: updated, error } = await supabase
            .from('practitioners')
            .update(updates)
            .eq('id', id)
            .eq('organization_id', admin.practitioner.organization_id)
            .select()
            .single()

        if (error || !updated) {
            console.error('Staff update error:', error)
            Sentry.captureException(error)
            return apiResponse.serverError('Failed to update staff member')
        }

        return apiResponse.ok(updated)
    } catch {
        return apiResponse.serverError()
    }
}

/**
 * DELETE /api/cms/staff/[id]
 * Soft-delete: sets is_active = false
 */
export async function DELETE(request: NextRequest, ctx: RouteContext) {
    const rl = await rateLimit(request, 'cms:staff:delete', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const admin = await requireAdmin(supabase)
        if (isGuardError(admin)) return admin

        const { id } = await ctx.params

        const { data: updated, error } = await supabase
            .from('practitioners')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('organization_id', admin.practitioner.organization_id)
            .select()
            .single()

        if (error || !updated) {
            return apiResponse.notFound('Staff member not found')
        }

        return apiResponse.ok(updated)
    } catch {
        return apiResponse.serverError()
    }
}
