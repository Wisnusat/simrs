import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'
import { buildInvoiceFromEncounter } from '@/lib/api/invoice-builder'
import { syncInvoice } from '@/lib/api/satu-sehat'

/**
 * GET /api/invoices
 * Query params (all optional):
 *   encounter_id   — return/auto-generate invoice for this specific encounter
 *   status         — filter by status (unpaid | paid | bpjs_claim_pending | cancelled)
 *   today          — "1" to restrict to today
 *
 * When encounter_id is supplied and no invoice exists yet, one is auto-generated
 * from the encounter's charges (consultation fee + procedures + lab + medications).
 *
 * POST /api/invoices
 * Body: { encounter_id } — manually trigger invoice generation.
 */

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, 'invoices:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const { searchParams } = new URL(req.url)
  const encounterId = searchParams.get('encounter_id')
  const status = searchParams.get('status')
  const today = searchParams.get('today')

  // ── Single encounter — return or auto-generate ──────────────────────────
  if (encounterId) {
    const { data: existing } = await supabase
      .from('invoices')
      .select('*, invoice_items(*), patients(full_name, medical_record_no, phone)')
      .eq('encounter_id', encounterId)
      .single()

    if (existing) return apiResponse.ok(existing)

    // Auto-generate from encounter charges
    const { data: encounter } = await supabase
      .from('encounters')
      .select('id, patient_id, organization_id, payment_type, status')
      .eq('id', encounterId)
      .single()

    if (!encounter) return apiResponse.notFound('Encounter not found')

    const built = await buildInvoiceFromEncounter(supabase, encounterId, (encounter as any).organization_id)
    const invoiceNumber = `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`

    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .insert({
        encounter_id: encounterId,
        patient_id: (encounter as any).patient_id,
        organization_id: (encounter as any).organization_id,
        invoice_number: invoiceNumber,
        payment_type: (encounter as any).payment_type ?? 'general',
        subtotal: built.subtotal,
        discount_amount: built.discount_amount,
        tax_amount: built.tax_amount,
        total_amount: built.total_amount,
        status: 'unpaid',
      })
      .select()
      .single()

    if (invError) return apiResponse.serverError(invError.message)

    await supabase.from('invoice_items').insert(
      built.items.map((item) => ({
        invoice_id: (invoice as any).id,
        item_type: item.item_type,
        item_name: item.item_name,
        item_code: item.item_code ?? null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        reference_id: item.reference_id ?? null,
      }))
    )

    const { data: full } = await supabase
      .from('invoices')
      .select('*, invoice_items(*), patients(full_name, medical_record_no, phone)')
      .eq('id', (invoice as any).id)
      .single()

    return apiResponse.created(full)
  }

  // ── List invoices ───────────────────────────────────────────────────────
  let query = supabase
    .from('invoices')
    .select(`
      *,
      invoice_items (*),
      patients ( full_name, medical_record_no, phone ),
      encounters ( poli_service_id, poli_services(name) )
    `)
    .eq('organization_id', practitioner.organization_id)
    .order('invoice_date', { ascending: false })

  if (status) query = query.eq('status', status)
  if (today === '1') {
    const d = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    query = query.gte('invoice_date', d)
  }

  const { data, error } = await query.limit(200)
  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}

export async function POST(req: NextRequest) {
  // Convenience: POST { encounter_id } triggers auto-generation same as GET ?encounter_id=
  const body = await req.json()
  const url = new URL(req.url)
  url.searchParams.set('encounter_id', body.encounter_id)
  return GET(new NextRequest(url, { headers: req.headers }))
}
