import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'
import * as Sentry from '@sentry/nextjs'

type RouteContext = { params: Promise<{ id: string; slotId: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
    const rl = await rateLimit(request, 'cms:poli:slots:update', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const { slotId } = await context.params
        const supabase = await createClient()
        const auth = await requireAdmin(supabase)
        if (isGuardError(auth)) return auth

        const body = await request.json()
        const updates: Record<string, any> = {}

        if (body.is_active !== undefined) updates.is_active = body.is_active
        if (body.quota !== undefined) updates.quota = body.quota
        if (body.start_time !== undefined) updates.start_time = body.start_time
        if (body.end_time !== undefined) updates.end_time = body.end_time
        if (body.practitioner_id !== undefined) updates.practitioner_id = body.practitioner_id || null

        if (Object.keys(updates).length === 0) {
            return apiResponse.badRequest('Tidak ada perubahan')
        }

        const { data, error } = await supabase
            .from('appointment_slots')
            .update(updates)
            .eq('id', slotId)
            .select()
            .single()

        if (error) {
            Sentry.captureException(error)
            return apiResponse.serverError(error.message)
        }

        return apiResponse.ok(data)
    } catch (e: any) {
        Sentry.captureException(e)
        return apiResponse.serverError()
    }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    const rl = await rateLimit(request, 'cms:poli:slots:delete', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const { slotId } = await context.params
        const supabase = await createClient()
        const auth = await requireAdmin(supabase)
        if (isGuardError(auth)) return auth

        const { error } = await supabase
            .from('appointment_slots')
            .delete()
            .eq('id', slotId)

        if (error) {
            Sentry.captureException(error)
            return apiResponse.serverError(error.message)
        }

        return apiResponse.ok({ deleted: true })
    } catch (e: any) {
        Sentry.captureException(e)
        return apiResponse.serverError()
    }
}
