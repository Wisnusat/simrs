import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireOwner, isGuardError } from '@/lib/api/guards'

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
            .select('id, status, organization_id')
            .eq('id', id)
            .eq('organization_id', owner.practitioner.organization_id)
            .single()

        if (fetchError || !po) {
            return apiResponse.notFound('Purchase order not found')
        }

        if (po.status !== 'po_draft' && po.status !== 'po_sent') {
            return apiResponse.badRequest(`Cannot ${action} a PO with status "${po.status}"`)
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
            return apiResponse.serverError('Failed to update purchase order')
        }

        return apiResponse.ok(updated)
    } catch {
        return apiResponse.serverError()
    }
}
