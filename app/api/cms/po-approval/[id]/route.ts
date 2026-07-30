import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireOwner, isGuardError } from '@/lib/api/guards'
import * as Sentry from '@sentry/nextjs'

interface RouteContext {
    params: Promise<{ id: string }>
}

/**
 * PATCH /api/cms/po-approval/[id]
 * Approve or reject a purchase order.
 * Body: { action: 'approve' | 'reject', rejection_reason?: string }
 * Auth: Owner only
 */
export async function PATCH(request: NextRequest, ctx: RouteContext) {
    const rl = await rateLimit(request, 'cms:po:action', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const owner = await requireOwner(supabase)
        if (isGuardError(owner)) return owner

        const { id } = await ctx.params
        const body = await request.json()
        const { action, rejection_reason } = body

        if (!action || !['approve', 'reject'].includes(action)) {
            return apiResponse.badRequest('action must be "approve" or "reject"')
        }

        // Verify PO exists and belongs to this org
        const { data: po, error: fetchError } = await supabase
            .from('purchase_orders')
            .select('id, status, organization_id, approved_at')
            .eq('id', id)
            .eq('organization_id', owner.practitioner.organization_id)
            .single()

        if (fetchError || !po) {
            return apiResponse.notFound('Purchase order not found')
        }

        if (action === 'approve') {
            if (po.status !== 'po_draft') {
                return apiResponse.badRequest(`Hanya PO dengan status draft yang bisa disetujui`)
            }
            if ((po as any).approved_at !== null) {
                return apiResponse.conflict('PO sudah disetujui sebelumnya')
            }
        } else {
            // reject
            if (!['po_draft', 'po_sent'].includes(po.status)) {
                return apiResponse.badRequest(`Tidak bisa menolak PO dengan status "${po.status}"`)
            }
        }

        const updates: Record<string, unknown> = {
            approved_by: owner.practitioner.id,
            approved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }

        if (action === 'approve') {
            updates.status = 'po_sent'
        } else {
            updates.status = 'po_cancelled'
            updates.rejection_reason = rejection_reason ?? 'Rejected by owner'
        }

        const { data: updated, error: updateError } = await supabase
            .from('purchase_orders')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (updateError) {
            console.error('PO update error:', updateError)
            Sentry.captureException(updateError)
            return apiResponse.serverError('Failed to update purchase order')
        }

        return apiResponse.ok(updated)
    } catch {
        return apiResponse.serverError()
    }
}
