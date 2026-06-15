/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'

/**
 * GET /api/pharmacist/po
 * List all POs for the pharmacist's organization
 */
export async function GET(request: NextRequest) {
    const rl = await rateLimit(request, 'pharmacist:po:list', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAdmin(supabase)
        if (isGuardError(auth)) return auth

        const { searchParams } = new URL(request.url)
        const status = searchParams.get('status')

        let query = supabase
            .from('purchase_orders')
            .select(`
                id, po_number, order_date, expected_delivery_date,
                status, total_amount, notes, rejection_reason,
                approved_at, created_at,
                created_by, approved_by,
                vendors (id, name, contact_person, phone, email),
                purchase_order_items (
                    id, quantity_ordered, unit_price, subtotal,
                    quantity_received, received_date, expiry_date,
                    batch_number, is_fully_received,
                    medications (id, name, generic_name, form, strength, unit)
                )
            `)
            .eq('organization_id', auth.practitioner.organization_id)
            .order('created_at', { ascending: false })

        if (status) query = query.eq('status', status)

        const { data: pos, error } = await query.limit(200)
        if (error) return apiResponse.serverError('Failed to fetch purchase orders')

        return apiResponse.ok(pos ?? [])
    } catch {
        return apiResponse.serverError()
    }
}

/**
 * POST /api/pharmacist/po
 * Create a new purchase order (draft)
 */
export async function POST(request: NextRequest) {
    const rl = await rateLimit(request, 'pharmacist:po:create', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAdmin(supabase)
        if (isGuardError(auth)) return auth

        const body = await request.json()
        const { vendor_id, order_date, expected_delivery_date, notes, items } = body

        if (!vendor_id) return apiResponse.badRequest('vendor_id is required')
        if (!items?.length) return apiResponse.badRequest('At least one item is required')

        // Generate PO number
        const timestamp = Date.now().toString().slice(-8)
        const po_number = `PO-${new Date().getFullYear()}-${timestamp}`

        // Calculate total
        const total_amount = items.reduce(
            (sum: number, item: any) => sum + item.quantity_ordered * item.unit_price,
            0
        )

        // Insert PO
        const { data: po, error: poError } = await supabase
            .from('purchase_orders')
            .insert({
                organization_id: auth.practitioner.organization_id,
                vendor_id,
                po_number,
                order_date: order_date ?? new Date().toISOString().split('T')[0],
                expected_delivery_date: expected_delivery_date ?? null,
                status: 'po_draft',
                total_amount,
                created_by: auth.practitioner.id,
                notes: notes ?? null,
            })
            .select()
            .single()

        if (poError) {
            console.error('PO insert error:', poError)
            return apiResponse.serverError('Failed to create purchase order')
        }

        // Insert items
        const poItems = items.map((item: any) => ({
            po_id: po.id,
            medication_id: item.medication_id,
            quantity_ordered: item.quantity_ordered,
            unit_price: item.unit_price,
        }))

        const { error: itemError } = await supabase
            .from('purchase_order_items')
            .insert(poItems)

        if (itemError) {
            console.error('PO items insert error:', itemError)
            return apiResponse.serverError('Failed to create PO items')
        }

        return apiResponse.created({ id: po.id, po_number })
    } catch {
        return apiResponse.serverError()
    }
}
