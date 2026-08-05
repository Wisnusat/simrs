/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'
import * as Sentry from '@sentry/nextjs'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
    const rl = await rateLimit(request, 'cms:medications:update', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const { id } = await context.params
        const supabase = await createClient()
        const auth = await requireAdmin(supabase)
        if (isGuardError(auth)) return auth

        const body = await request.json()
        const updates: Record<string, any> = {}

        const allowed = ['name', 'generic_name', 'brand_name', 'form', 'strength', 'unit', 'category', 'kfa_code', 'ss_medication_id', 'is_narcotics', 'is_psychotropics', 'requires_prescription', 'is_active']
        for (const key of allowed) {
            if (body[key] !== undefined) updates[key] = body[key]
        }

        if (Object.keys(updates).length === 0) return apiResponse.badRequest('Tidak ada perubahan')

        const { data, error } = await supabase
            .from('medications')
            .update(updates)
            .eq('id', id)
            .eq('organization_id', auth.practitioner.organization_id)
            .select()
            .single()

        if (error) { Sentry.captureException(error); return apiResponse.serverError(error.message) }
        return apiResponse.ok(data)
    } catch (e) {
        Sentry.captureException(e)
        return apiResponse.serverError()
    }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    const rl = await rateLimit(request, 'cms:medications:delete', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const { id } = await context.params
        const supabase = await createClient()
        const auth = await requireAdmin(supabase)
        if (isGuardError(auth)) return auth

        // Soft delete — check if referenced in prescriptions
        const { count } = await supabase
            .from('prescription_items')
            .select('id', { count: 'exact', head: true })
            .eq('medication_id', id)

        if ((count ?? 0) > 0) {
            // Soft delete only
            const { error } = await supabase
                .from('medications')
                .update({ is_active: false })
                .eq('id', id)
                .eq('organization_id', auth.practitioner.organization_id)

            if (error) { Sentry.captureException(error); return apiResponse.serverError(error.message) }
            return apiResponse.ok({ deleted: false, deactivated: true, message: 'Obat memiliki riwayat resep — dinonaktifkan, tidak dihapus' })
        }

        const { error } = await supabase
            .from('medications')
            .delete()
            .eq('id', id)
            .eq('organization_id', auth.practitioner.organization_id)

        if (error) { Sentry.captureException(error); return apiResponse.serverError(error.message) }
        return apiResponse.ok({ deleted: true })
    } catch (e) {
        Sentry.captureException(e)
        return apiResponse.serverError()
    }
}
