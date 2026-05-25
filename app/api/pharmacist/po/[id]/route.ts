/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'

/**
 * PATCH /api/pharmacist/po/[id]
 * Update PO — either:
 *   action: 'send'    → po_draft → po_sent
 *   action: 'receive' → record received quantities for items
 *                       auto-transitions to po_completed if all items fully received
 *                       or po_partially_received if partial
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const rl = rateLimit(request, 'pharmacist:po:update', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAdmin(supabase)
        if (isGuardError(auth)) return auth

        const { id } = await params
        const body = await request.json()
        const { action } = body

        // Fetch existing PO
        const { data: po, error: fetchError } = await supabase
            .from('purchase_orders')
            .select('*, purchase_order_items(*)')
            .eq('id', id)
            .eq('organization_id', auth.practitioner.organization_id)
            .single()

        if (fetchError || !po) return apiResponse.notFound('Purchase order not found')

        // ── SEND ──────────────────────────────────────────────────────────────
        if (action === 'send') {
            if (po.status !== 'po_draft') {
                return apiResponse.badRequest('Only draft POs can be sent')
            }
            const { error } = await supabase
                .from('purchase_orders')
                .update({ status: 'po_sent', updated_at: new Date().toISOString() })
                .eq('id', id)

            if (error) return apiResponse.serverError('Failed to update PO status')
            return apiResponse.ok({ status: 'po_sent' })
        }

        // ── RECEIVE ───────────────────────────────────────────────────────────
        if (action === 'receive') {
            if (!['po_sent', 'po_partially_received'].includes(po.status)) {
                return apiResponse.badRequest('PO must be sent or partially received to record receipt')
            }

            // items: [{ item_id, quantity_received, expiry_date?, batch_number? }]
            const { items } = body
            if (!items?.length) return apiResponse.badRequest('items array is required')

            // Update each item
            for (const recv of items as any[]) {
                const existing = po.purchase_order_items.find((i: any) => i.id === recv.item_id)
                if (!existing) continue

                const newQty = Math.min(
                    (existing.quantity_received ?? 0) + (recv.quantity_received ?? 0),
                    existing.quantity_ordered
                )

                await supabase
                    .from('purchase_order_items')
                    .update({
                        quantity_received: newQty,
                        received_date: recv.received_date ?? new Date().toISOString().split('T')[0],
                        expiry_date: recv.expiry_date ?? existing.expiry_date,
                        batch_number: recv.batch_number ?? existing.batch_number,
                    })
                    .eq('id', recv.item_id)

                // Update medication stock
                const addedQty = newQty - (existing.quantity_received ?? 0)
                if (addedQty > 0) {
                    const { data: med } = await supabase
                        .from('medications')
                        .select('stock_available')
                        .eq('id', existing.medication_id)
                        .single()

                    if (med) {
                        await supabase
                            .from('medications')
                            .update({ stock_available: (med.stock_available ?? 0) + addedQty })
                            .eq('id', existing.medication_id)
                    }
                }
            }

            // Re-fetch items to determine new PO status
            const { data: updatedItems } = await supabase
                .from('purchase_order_items')
                .select('quantity_ordered, quantity_received')
                .eq('po_id', id)

            const allReceived = (updatedItems ?? []).every(
                (i: any) => (i.quantity_received ?? 0) >= i.quantity_ordered
            )
            const anyReceived = (updatedItems ?? []).some(
                (i: any) => (i.quantity_received ?? 0) > 0
            )

            const newStatus = allReceived
                ? 'po_completed'
                : anyReceived
                ? 'po_partially_received'
                : po.status

            await supabase
                .from('purchase_orders')
                .update({ status: newStatus, updated_at: new Date().toISOString() })
                .eq('id', id)

            return apiResponse.ok({ status: newStatus, all_received: allReceived })
        }

        return apiResponse.badRequest('Unknown action')
    } catch (err) {
        console.error('PO update error:', err)
        return apiResponse.serverError()
    }
}
