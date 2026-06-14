/**
 * lib/api/invoice-builder.ts
 *
 * Pure function: computes invoice line items from an encounter
 * (consultation fee, procedures, lab orders, prescription medications).
 *
 * Used by:
 *   - GET /api/invoices?encounter_id=...  (on-demand auto-generation)
 *   - PATCH /api/encounters/[id] status=waiting_payment (eager generation)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface InvoiceLineItem {
  item_type: 'consultation' | 'medication' | 'action' | 'lab'
  item_name: string
  item_code?: string
  quantity: number
  unit_price: number
  reference_id?: string
}

export interface BuiltInvoice {
  subtotal: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  items: InvoiceLineItem[]
}

export async function buildInvoiceFromEncounter(
  supabase: SupabaseClient,
  encounterId: string,
  organizationId: string,
): Promise<BuiltInvoice> {
  const items: InvoiceLineItem[] = []

  // ── 1. Consultation fee ────────────────────────────────────────────────
  const { data: org } = await supabase
    .from('organizations')
    .select('medical_fee')
    .eq('id', organizationId)
    .single()

  const consultationFee: number = (org as any)?.medical_fee ?? 50_000
  items.push({
    item_type: 'consultation',
    item_name: 'Biaya Konsultasi Dokter',
    quantity: 1,
    unit_price: consultationFee,
  })

  // ── 2. Procedures / tindakan ───────────────────────────────────────────
  const { data: procedures } = await supabase
    .from('procedures')
    .select('id, procedure_code, procedure_display')
    .eq('encounter_id', encounterId)
    .eq('status', 'completed')

  for (const proc of (procedures ?? [])) {
    items.push({
      item_type: 'action',
      item_name: proc.procedure_display,
      item_code: proc.procedure_code,
      quantity: 1,
      unit_price: 50_000,
      reference_id: proc.id,
    })
  }

  // ── 3. Lab orders ──────────────────────────────────────────────────────
  const { data: labOrders } = await supabase
    .from('lab_orders')
    .select('id, lab_order_items(id, test_name, loinc_code)')
    .eq('encounter_id', encounterId)

  for (const lo of (labOrders ?? [])) {
    for (const item of (lo.lab_order_items ?? [])) {
      items.push({
        item_type: 'lab',
        item_name: item.test_name,
        item_code: item.loinc_code,
        quantity: 1,
        unit_price: 75_000,
        reference_id: lo.id,
      })
    }
  }

  // ── 4. Medications (from prescription items) ───────────────────────────
  const { data: prescriptions } = await supabase
    .from('prescriptions')
    .select(`
      id,
      prescription_items (
        id, quantity, medication_id,
        medications ( name, unit )
      )
    `)
    .eq('encounter_id', encounterId)
    .neq('status', 'cancelled')

  for (const rx of (prescriptions ?? [])) {
    for (const pi of (rx.prescription_items ?? [])) {
      const med = (pi as any).medications
      // Fetch unit price from medications / stock_movements or use a fallback
      const { data: stock } = await supabase
        .from('stock_movements')
        .select('unit_price')
        .eq('medication_id', pi.medication_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const unitPrice: number = (stock as any)?.unit_price ?? 5_000
      items.push({
        item_type: 'medication',
        item_name: med?.name ?? 'Obat',
        quantity: pi.quantity,
        unit_price: unitPrice,
        reference_id: rx.id,
      })
    }
  }

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
  const discount_amount = 0
  const tax_amount = 0
  const total_amount = subtotal - discount_amount + tax_amount

  return { subtotal, discount_amount, tax_amount, total_amount, items }
}

export async function syncInvoiceForEncounter(
  supabase: SupabaseClient,
  encounterId: string
): Promise<void> {
  const { data: enc } = await supabase
    .from('encounters')
    .select('patient_id, organization_id, payment_type')
    .eq('id', encounterId)
    .single()

  if (!enc) return

  const orgId = (enc as any).organization_id
  const built = await buildInvoiceFromEncounter(supabase, encounterId, orgId)

  let { data: invoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('encounter_id', encounterId)
    .maybeSingle()

  if (!invoice) {
    const invoiceNumber = `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`
    const { data: newInvoice } = await supabase
      .from('invoices')
      .insert({
        encounter_id: encounterId,
        patient_id: (enc as any).patient_id,
        organization_id: orgId,
        invoice_number: invoiceNumber,
        payment_type: (enc as any).payment_type ?? 'general',
        subtotal: built.subtotal,
        discount_amount: built.discount_amount,
        tax_amount: built.tax_amount,
        total_amount: built.total_amount,
        status: 'unpaid',
      })
      .select('id')
      .single()

    if (newInvoice) invoice = newInvoice
  } else {
    // Update existing invoice totals
    await supabase
      .from('invoices')
      .update({
        subtotal: built.subtotal,
        discount_amount: built.discount_amount,
        tax_amount: built.tax_amount,
        total_amount: built.total_amount,
      })
      .eq('id', invoice.id)
  }

  // Rewrite line items
  if (invoice) {
    const invId = (invoice as any).id
    await supabase.from('invoice_items').delete().eq('invoice_id', invId)
    if (built.items.length > 0) {
      await supabase.from('invoice_items').insert(
        built.items.map((item) => ({ invoice_id: invId, ...item }))
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Inpatient episode-level invoice sync
// ---------------------------------------------------------------------------

const ROOM_RATES: Record<string, number> = {
  vip: 500_000,
  kelas_1: 350_000,
  kelas_2: 250_000,
  kelas_3: 150_000,
}

/**
 * Aggregates charges across ALL encounters in an episode of care.
 * Includes room charges (daily rate × days) plus all clinical charges
 * from every encounter linked to the episode.
 */
export async function syncInvoiceForEpisode(
  supabase: SupabaseClient,
  episodeOfCareId: string
): Promise<void> {
  // Fetch episode info
  const { data: episode } = await supabase
    .from('episodes_of_care')
    .select('id, patient_id, organization_id, start_date, end_date')
    .eq('id', episodeOfCareId)
    .single()

  if (!episode) return

  // Fetch admission for room info
  const { data: admission } = await supabase
    .from('inpatient_admissions')
    .select('id, room_class, admission_date, discharge_date')
    .eq('episode_of_care_id', episodeOfCareId)
    .order('admission_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Fetch all encounters in this episode
  const { data: encounters } = await supabase
    .from('encounters')
    .select('id')
    .eq('episode_of_care_id', episodeOfCareId)

  const encounterIds = (encounters ?? []).map((e: any) => e.id)

  const allItems: InvoiceLineItem[] = []

  // 1. Room charges
  if (admission) {
    const startDate = new Date(admission.admission_date)
    const endDate = admission.discharge_date ? new Date(admission.discharge_date) : new Date()
    const days = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))
    const dailyRate = ROOM_RATES[admission.room_class] ?? ROOM_RATES.kelas_3

    allItems.push({
      item_type: 'room' as any,
      item_name: `Biaya Kamar (${admission.room_class.replace('_', ' ').toUpperCase()}) × ${days} hari`,
      quantity: days,
      unit_price: dailyRate,
      reference_id: admission.id,
    })
  }

  // 2. Running bill manual charges
  const { data: runningBills } = await supabase
    .from('running_bills')
    .select('item_type, item_name, item_code, quantity, unit_price, reference_id')
    .eq('episode_of_care_id', episodeOfCareId)

  for (const rb of (runningBills ?? [])) {
    allItems.push({
      item_type: rb.item_type as any,
      item_name: rb.item_name,
      item_code: rb.item_code ?? undefined,
      quantity: rb.quantity,
      unit_price: rb.unit_price,
      reference_id: rb.reference_id ?? undefined,
    })
  }

  // 3. Aggregate charges from all encounters
  for (const encId of encounterIds) {
    const built = await buildInvoiceFromEncounter(
      supabase,
      encId,
      (episode as any).organization_id,
    )
    allItems.push(...built.items)
  }

  const subtotal = allItems.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
  const total_amount = subtotal

  // Upsert episode-level invoice (use episode_of_care_id as reference)
  let { data: invoice } = await supabase
    .from('invoices')
    .select('id')
    .eq('episode_of_care_id', episodeOfCareId)
    .maybeSingle()

  if (!invoice) {
    // Try linking to first encounter
    const firstEncounterId = encounterIds[0] ?? null
    const invoiceNumber = `INV-IP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`
    const { data: newInvoice } = await supabase
      .from('invoices')
      .insert({
        encounter_id: firstEncounterId,
        episode_of_care_id: episodeOfCareId,
        patient_id: (episode as any).patient_id,
        organization_id: (episode as any).organization_id,
        invoice_number: invoiceNumber,
        payment_type: 'umum',
        subtotal,
        discount_amount: 0,
        tax_amount: 0,
        total_amount,
        status: 'unpaid',
      })
      .select('id')
      .single()

    if (newInvoice) invoice = newInvoice
  } else {
    await supabase
      .from('invoices')
      .update({ subtotal, total_amount, discount_amount: 0, tax_amount: 0 })
      .eq('id', invoice.id)
  }

  // Rewrite line items
  if (invoice) {
    const invId = (invoice as any).id
    await supabase.from('invoice_items').delete().eq('invoice_id', invId)
    if (allItems.length > 0) {
      await supabase.from('invoice_items').insert(
        allItems.map((item) => ({ invoice_id: invId, ...item }))
      )
    }
  }
}
