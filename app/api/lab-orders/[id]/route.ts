import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'

/**
 * GET /api/lab-orders/[id]
 * Full lab order with all items and their current result data.
 *
 * PATCH /api/lab-orders/[id]
 * Two modes:
 *   { status: LabOrderStatus }
 *     — Advance workflow step (sample_taken → processing → result_uploaded → verified).
 *     — Setting sample_taken also stamps lab_nurse_id.
 *
 *   { item_results: [{ item_id, result_value, result_unit?, reference_range?,
 *                       result_status?, notes? }] }
 *     — Enters individual test results.
 *     — Auto-advances order status to result_uploaded.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { id } = await params
  const { data, error } = await supabase
    .from('lab_orders')
    .select(`
      *,
      patients ( full_name, medical_record_no, date_of_birth, gender ),
      practitioners ( full_name ),
      lab_order_items ( * )
    `)
    .eq('id', id)
    .single()

  if (error || !data) return apiResponse.notFound('Lab order not found')
  return apiResponse.ok(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await rateLimit(req, 'lab-orders:patch', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const { id } = await params
  const body = await req.json()

  // ── Status update ───────────────────────────────────────────────────────
  if (body.status) {
    const { data, error } = await supabase
      .from('lab_orders')
      .update({
        status: body.status,
        ...(body.status === 'sample_taken' ? { lab_nurse_id: practitioner.id } : {}),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return apiResponse.serverError(error.message)
    return apiResponse.ok(data)
  }

  // ── Result entry ────────────────────────────────────────────────────────
  if (body.item_results && Array.isArray(body.item_results)) {
    const now = new Date().toISOString()

    const updates = await Promise.all(
      (body.item_results as any[]).map((item) =>
        supabase
          .from('lab_order_items')
          .update({
            result_value: item.result_value,
            result_unit: item.result_unit ?? null,
            reference_range: item.reference_range ?? null,
            result_status: item.result_status ?? 'normal',
            file_id: item.file_id ?? null,
            result_entered_at: now,
            result_entered_by: practitioner.id,
            notes: item.notes ?? null,
          })
          .eq('id', item.item_id)
          .select()
          .single()
      )
    )

    const failed = updates.filter((u) => u.error)
    if (failed.length > 0) return apiResponse.serverError('Failed to update some lab results')

    // Auto-advance to result_uploaded
    await supabase.from('lab_orders').update({ status: 'result_uploaded' }).eq('id', id)

    return apiResponse.ok({ updated: updates.length })
  }

  return apiResponse.badRequest("Provide either 'status' or 'item_results'")
}
