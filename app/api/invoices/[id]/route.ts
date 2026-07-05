import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'

/**
 * GET /api/invoices/[id]
 * Full invoice with line items, patient, and encounter context.
 *
 * PATCH /api/invoices/[id]
 * Body: { action: 'pay' | 'cancel', payment_method?, paid_amount? }
 *
 * Payment logic:
 *   - BPJS (payment_type or payment_method === 'bpjs') → status: bpjs_claim_pending
 *   - cash / card / transfer → status: paid, stamps paid_at and cashier_id
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
    .from('invoices')
    .select(`
      *,
      invoice_items (*),
      patients ( full_name, medical_record_no, date_of_birth, phone ),
      encounters (
        id,
        poli_service_id,
        poli_services ( name ),
        appointment_id,
        appointments ( booking_code, chief_complaint )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !data) return apiResponse.notFound('Invoice not found')
  return apiResponse.ok(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await rateLimit(req, 'invoices:patch', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  if (!['cashier', 'admin'].includes(practitioner.role))
    return apiResponse.forbidden('Only cashiers can process payments')

  const { id } = await params
  const { action, payment_method, paid_amount } = await req.json()

  if (!action) return apiResponse.badRequest('action is required')

  // ── Cancel ──────────────────────────────────────────────────────────────
  if (action === 'cancel') {
    const { data, error } = await supabase
      .from('invoices')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single()

    if (error) return apiResponse.serverError(error.message)
    return apiResponse.ok(data)
  }

  // ── Pay ─────────────────────────────────────────────────────────────────
  if (action === 'pay') {
    const { data: invoice } = await supabase
      .from('invoices')
      .select('total_amount, payment_type, status')
      .eq('id', id)
      .single()

    if (!invoice) return apiResponse.notFound('Invoice not found')
    if ((invoice as any).status === 'paid') return apiResponse.conflict('Invoice already paid')

    // BPJS path
    if ((invoice as any).payment_type === 'bpjs' || payment_method === 'bpjs') {
      const { data, error } = await supabase
        .from('invoices')
        .update({ status: 'bpjs_claim_pending', cashier_id: practitioner.id, paid_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) return apiResponse.serverError(error.message)
      return apiResponse.ok({ ...data, message: 'BPJS claim submitted — pending verification' })
    }

    // Cash / card / transfer
    const { data, error } = await supabase
      .from('invoices')
      .update({
        status: 'paid',
        paid_amount: paid_amount ?? (invoice as any).total_amount,
        paid_at: new Date().toISOString(),
        cashier_id: practitioner.id,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return apiResponse.serverError(error.message)

    // Cascade: mark the encounter as finished
    if ((data as any).encounter_id) {
      await supabase
        .from('encounters')
        .update({ status: 'finished', finished_at: new Date().toISOString() })
        .eq('id', (data as any).encounter_id)
    }

    return apiResponse.ok(data)
  }

  return apiResponse.badRequest("action must be 'pay' or 'cancel'")
}
