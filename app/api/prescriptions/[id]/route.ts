import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'
import { syncDispense } from '@/lib/api/satu-sehat'

/**
 * GET /api/prescriptions/[id]
 * Full prescription with items and per-batch FEFO stock levels.
 *
 * PATCH /api/prescriptions/[id]
 * Two modes:
 *   { status: string }   — update status only (pharmacist workflow step)
 *   { dispense: true }   — FEFO stock deduction + dispense record creation
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const { id } = await params

  const { data: rx, error } = await supabase
    .from('prescriptions')
    .select(`
      *,
      patients ( full_name, medical_record_no, date_of_birth ),
      practitioners ( full_name ),
      prescription_items (
        *,
        medications ( id, name, generic_name, form, strength, unit )
      )
    `)
    .eq('id', id)
    .single()

  if (error || !rx) return apiResponse.notFound('Prescription not found')

  const medIds = ((rx as any).prescription_items ?? []).map((i: any) => i.medication_id)
  const { data: stocks } = await supabase
    .from('medication_stock')
    .select('id, medication_id, quantity, unit_price, batch_number, expiry_date')
    .in('medication_id', medIds.length > 0 ? medIds : ['__none__'])
    .eq('organization_id', practitioner.organization_id)
    .order('expiry_date', { ascending: true })

  const stockMap = new Map<string, any[]>()
  for (const s of stocks ?? []) {
    const list = stockMap.get((s as any).medication_id) ?? []
    list.push(s)
    stockMap.set((s as any).medication_id, list)
  }

  return apiResponse.ok({
    ...(rx as any),
    prescription_items: ((rx as any).prescription_items ?? []).map((item: any) => ({
      ...item,
      stock_batches: stockMap.get(item.medication_id) ?? [],
      stock_available: (stockMap.get(item.medication_id) ?? []).reduce(
        (sum: number, b: any) => sum + b.quantity, 0
      ),
    })),
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await rateLimit(req, 'prescriptions:patch', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  if (!['pharmacist', 'admin'].includes(practitioner.role))
    return apiResponse.forbidden('Only pharmacists can process dispenses')

  const { id } = await params
  const body = await req.json()

  // ── Status-only update ──────────────────────────────────────────────────
  if (body.status && !body.dispense) {
    const { data, error } = await supabase
      .from('prescriptions')
      .update({ status: body.status })
      .eq('id', id)
      .select()
      .single()

    if (error) return apiResponse.serverError(error.message)
    return apiResponse.ok(data)
  }

  // ── Dispense — FEFO stock deduction ────────────────────────────────────
  if (body.dispense) {
    const { error: statusErr } = await supabase
      .from('prescriptions')
      .update({ status: 'completed' })
      .eq('id', id)

    if (statusErr) return apiResponse.serverError(`Gagal mengubah status resep: ${statusErr.message}`)

    const { data: rx, error: rxErr } = await supabase
      .from('prescriptions')
      .select('*, prescription_items ( id, medication_id, quantity, medications(name) )')
      .eq('id', id)
      .single()

    if (rxErr || !rx) return apiResponse.notFound('Prescription not found')

    // Check if this prescription belongs to an inpatient encounter
    const { data: enc } = await supabase
      .from('encounters')
      .select('encounter_class, episode_of_care_id, patient_id')
      .eq('id', (rx as any).encounter_id)
      .maybeSingle()
    const isInpatient = (enc as any)?.encounter_class === 'inpatient' && (enc as any)?.episode_of_care_id

    const errors: string[] = []
    let dispensedCount = 0

    for (const item of (rx as any).prescription_items ?? []) {
      const { data: batches } = await supabase
        .from('medication_stock')
        .select('id, quantity, unit_price')
        .eq('medication_id', item.medication_id)
        .eq('organization_id', practitioner.organization_id)
        .gt('quantity', 0)
        .order('expiry_date', { ascending: true }) // FEFO

      const totalStock = (batches ?? []).reduce((s: number, b: any) => s + b.quantity, 0)
      if (totalStock < item.quantity) {
        errors.push(`Stok tidak cukup untuk obat ID ${item.medication_id}`)
        continue
      }

      let remaining = item.quantity
      for (const batch of batches ?? []) {
        if (remaining <= 0) break
        const deduct = Math.min(remaining, (batch as any).quantity)

        await supabase
          .from('medication_stock')
          .update({ quantity: (batch as any).quantity - deduct })
          .eq('id', (batch as any).id)

        const { data: dispense } = await supabase
          .from('medication_dispenses')
          .insert({
            prescription_id: id,
            prescription_item_id: item.id,
            encounter_id: (rx as any).encounter_id,
            patient_id: (rx as any).patient_id,
            dispensed_by: practitioner.id,
            medication_id: item.medication_id,
            stock_id: (batch as any).id,
            quantity_dispensed: deduct,
          })
          .select()
          .single()

        if (dispense) {
          dispensedCount++
          syncDispense(supabase, (dispense as any).id ?? '', {}).catch(() => { })

          // Auto-add medication charge to running bill for inpatient
          if (isInpatient) {
            supabase.from('running_bills').insert({
              episode_of_care_id: (enc as any).episode_of_care_id,
              patient_id: (enc as any).patient_id ?? (rx as any).patient_id,
              item_type: 'medication',
              item_name: (item as any).medications?.name ?? `Obat ID ${item.medication_id}`,
              quantity: deduct,
              unit_price: (batch as any).unit_price,
              reference_id: (dispense as any).id,
              charge_date: new Date().toISOString().split('T')[0],
            }).then(() => {}).catch(() => {})
          }
        }
        remaining -= deduct
      }

      await supabase
        .from('prescription_items')
        .update({ is_dispensed: true })
        .eq('id', item.id)
    }

    return apiResponse.ok({ dispensed: dispensedCount, errors })
  }

  return apiResponse.badRequest("Provide either 'status' or 'dispense: true'")
}
