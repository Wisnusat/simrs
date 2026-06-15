import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'

interface RouteContext {
    params: Promise<{ id: string }>
}

/**
 * PATCH /api/cms/poli/[id]
 * Updates an existing poli service.
 * Auth: Admin role only
 */
export async function PATCH(
    request: NextRequest,
    ctx: RouteContext
) {
    try {
        const { id } = await ctx.params
        const rl = await rateLimit(request, `cms:poli:update:${id}`, RATE_LIMITS.write)
        if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

        const supabase = await createClient()
        const admin = await requireAdmin(supabase)
        if (isGuardError(admin)) return admin

        const body = await request.json()
        const { name, code, location_id, speciality_code, quota_per_day, is_active } = body

        const updates: Record<string, any> = {}
        if (name !== undefined) updates.name = name
        if (code !== undefined) updates.code = code.toUpperCase()
        if (location_id !== undefined) updates.location_id = location_id
        if (speciality_code !== undefined) updates.speciality_code = speciality_code ?? null
        if (quota_per_day !== undefined) {
            if (typeof quota_per_day !== 'number' || quota_per_day < 1) {
                return apiResponse.badRequest('quota_per_day must be a positive number')
            }
            updates.quota_per_day = quota_per_day
        }
        if (is_active !== undefined) updates.is_active = !!is_active

        if (Object.keys(updates).length === 0) {
            return apiResponse.badRequest('No fields to update')
        }

        const { data: updatedPoli, error: updateError } = await supabase
            .from('poli_services')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (updateError) {
            console.error('Poli update error:', updateError)
            if (updateError.code === '23505') {
                return apiResponse.conflict('Code already exists')
            }
            return apiResponse.serverError('Failed to update poli service')
        }

        return apiResponse.ok(updatedPoli)
    } catch (e) {
        console.error('Poli PATCH error:', e)
        return apiResponse.serverError()
    }
}

/**
 * DELETE /api/cms/poli/[id]
 * Deletes a poli service.
 * Auth: Admin role only
 */
export async function DELETE(
    request: NextRequest,
    ctx: RouteContext
) {
    try {
        const { id } = await ctx.params
        const rl = await rateLimit(request, `cms:poli:delete:${id}`, RATE_LIMITS.write)
        if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

        const supabase = await createClient()
        const admin = await requireAdmin(supabase)
        if (isGuardError(admin)) return admin

        const { error: deleteError } = await supabase
            .from('poli_services')
            .delete()
            .eq('id', id)

        if (deleteError) {
            console.error('Poli delete error:', deleteError)
            return apiResponse.serverError('Failed to delete poli service')
        }

        return apiResponse.ok({ message: 'Poli service deleted successfully' })
    } catch (e) {
        console.error('Poli DELETE error:', e)
        return apiResponse.serverError()
    }
}
