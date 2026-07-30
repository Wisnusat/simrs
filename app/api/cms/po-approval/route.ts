/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireOwner, isGuardError } from '@/lib/api/guards'
import * as Sentry from '@sentry/nextjs'

/**
 * GET /api/cms/po-approval
 * Lists all purchase orders for approval.
 * Auth: Owner only
 */
export async function GET(request: NextRequest) {
    const rl = await rateLimit(request, 'cms:po:list', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const owner = await requireOwner(supabase)
        if (isGuardError(owner)) return owner

        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status')

        let query = supabase
            .from('purchase_orders')
            .select(`
                id,
                po_number,
                order_date,
                expected_delivery_date,
                status,
                total_amount,
                notes,
                rejection_reason,
                approved_at,
                created_at,
                created_by,
                approved_by,
                vendors (id, name, contact_person, phone),
                purchase_order_items (
                    id,
                    quantity_ordered,
                    unit_price,
                    subtotal,
                    quantity_received,
                    is_fully_received,
                    medications (name)
                )
            `)
            .eq('organization_id', owner.practitioner.organization_id)
            .order('created_at', { ascending: false })

        if (status) query = query.eq('status', status)

        const { data: pos, error } = await query.limit(100)

        if (error) {
            console.error('PO list error:', error)
            Sentry.captureException(error)
            return apiResponse.serverError('Failed to fetch purchase orders')
        }

        // Resolve practitioner names for created_by and approved_by
        const practitionerIds = new Set<string>()
        for (const po of pos ?? []) {
            if (po.created_by) practitionerIds.add(po.created_by)
            if (po.approved_by) practitionerIds.add(po.approved_by)
        }

        const idArray = Array.from(practitionerIds)
        const { data: practitioners } = idArray.length > 0
            ? await supabase
                .from('practitioners')
                .select('id, full_name')
                .in('id', idArray)
            : { data: [] }

        const nameMap = new Map<string, string>()
        for (const p of practitioners ?? []) {
            nameMap.set(p.id, p.full_name)
        }

        const enriched = (pos ?? []).map((po: any) => ({
            ...po,
            created_by_name: nameMap.get(po.created_by) ?? 'Unknown',
            approved_by_name: po.approved_by ? nameMap.get(po.approved_by) ?? null : null,
            vendor: po.vendors,
            items: (po.purchase_order_items ?? []).map((item: any) => ({
                ...item,
                medication_name: item.medications?.name ?? 'Unknown',
            })),
        }))

        return apiResponse.ok(enriched)
    } catch {
        return apiResponse.serverError()
    }
}
