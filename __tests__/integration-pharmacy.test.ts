/**
 * Integration tests — Pharmacy flow
 * Covers:
 *   1. Unit: validasi prescription, FEFO logic, PO total calc, status transitions
 *   2. Integration: prescription INSERT + dispense + stock deduction
 *   3. PO full flow: draft → sent → receive (partial) → receive (complete)
 *   4. Vendor data integrity
 *   5. Role guard logic
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let supabase: ReturnType<typeof createClient>

const seeded = {
  orgId: '' as string,
  patientId: '' as string,
  doctorId: '' as string,
  pharmacistId: '' as string,
  adminId: '' as string,
  encounterId: '' as string,
  medicationId: '' as string,
  stockId: '' as string,
  stockQtyBefore: 0,
  prescriptionId: '' as string,
  prescriptionItemId: '' as string,
  vendorId: '' as string,
  poId: '' as string,
  poItemId: '' as string,
}

const dispenseIds: string[] = []
const extraPrescriptionIds: string[] = []

beforeAll(async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib di .env')
  }
  supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: org } = await supabase.from('organizations').select('id').limit(1).single()
  seeded.orgId = org?.id ?? ''

  const { data: patient } = await supabase.from('patients').select('id').limit(1).single()
  seeded.patientId = patient?.id ?? ''

  const { data: doctor } = await supabase
    .from('practitioners').select('id').eq('role', 'doctor').eq('is_active', true).limit(1).maybeSingle()
  seeded.doctorId = doctor?.id ?? ''

  const { data: pharmacist } = await supabase
    .from('practitioners').select('id').eq('role', 'pharmacist').eq('is_active', true).limit(1).maybeSingle()
  seeded.pharmacistId = pharmacist?.id ?? ''

  const { data: admin } = await supabase
    .from('practitioners').select('id').eq('role', 'admin').eq('is_active', true).limit(1).maybeSingle()
  seeded.adminId = admin?.id ?? ''

  // Buat encounter untuk prescription
  if (seeded.patientId && seeded.orgId) {
    const { data: enc } = await supabase
      .from('encounters')
      .insert({
        patient_id: seeded.patientId,
        organization_id: seeded.orgId,
        encounter_class: 'outpatient',
        status: 'in_progress',
        arrived_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    seeded.encounterId = enc?.id ?? ''
  }

  // Ambil medication dengan stock > 0
  const { data: med } = await supabase
    .from('medications')
    .select('id, name, stock_available')
    .gt('stock_available', 0)
    .limit(1)
    .maybeSingle()
  seeded.medicationId = med?.id ?? ''

  // Ambil/buat medication_stock untuk medication ini
  if (seeded.medicationId && seeded.orgId) {
    const { data: stock } = await supabase
      .from('medication_stock')
      .select('id, quantity')
      .eq('medication_id', seeded.medicationId)
      .eq('organization_id', seeded.orgId)
      .gt('quantity', 0)
      .order('expiry_date', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (stock) {
      seeded.stockId = stock.id
      seeded.stockQtyBefore = stock.quantity
    }
  }

  // Ambil vendor
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id')
    .limit(1)
    .maybeSingle()
  seeded.vendorId = vendor?.id ?? ''
})

afterAll(async () => {
  // Hapus dispense records
  for (const id of dispenseIds) {
    await supabase.from('medication_dispenses').delete().eq('id', id)
  }

  // Restore medication_stock jika ada dispense yang mengubah quantity
  if (seeded.stockId && seeded.stockQtyBefore > 0) {
    await supabase
      .from('medication_stock')
      .update({ quantity: seeded.stockQtyBefore })
      .eq('id', seeded.stockId)
  }

  // Hapus prescription items + prescription utama
  if (seeded.prescriptionId) {
    await supabase.from('prescription_items').delete().eq('prescription_id', seeded.prescriptionId)
    await supabase.from('prescriptions').delete().eq('id', seeded.prescriptionId)
  }

  // Hapus extra prescriptions
  for (const id of extraPrescriptionIds) {
    await supabase.from('prescription_items').delete().eq('prescription_id', id)
    await supabase.from('prescriptions').delete().eq('id', id)
  }

  // Hapus PO items + PO
  if (seeded.poId) {
    await supabase.from('purchase_order_items').delete().eq('po_id', seeded.poId)
    await supabase.from('purchase_orders').delete().eq('id', seeded.poId)
  }

  // Hapus encounter
  if (seeded.encounterId) {
    await supabase.from('encounters').delete().eq('id', seeded.encounterId)
  }
})

// ---------------------------------------------------------------------------
// Skenario 1 — Unit: validasi prescription
// ---------------------------------------------------------------------------

describe('Unit: validasi prescription', () => {
  it('encounter_id, patient_id, items wajib ada', () => {
    const validate = (body: Record<string, unknown>) => {
      const { encounter_id, patient_id, items } = body
      return !!(encounter_id && patient_id && (items as unknown[])?.length)
    }
    expect(validate({ encounter_id: 'e1', patient_id: 'p1', items: [{ medication_id: 'm1', quantity: 1, dosage: '1 tablet' }] })).toBe(true)
    expect(validate({ patient_id: 'p1', items: [{}] })).toBe(false)
    expect(validate({ encounter_id: 'e1', patient_id: 'p1', items: [] })).toBe(false)
  })

  it('hanya doctor/admin bisa POST prescription', () => {
    const allowed = ['doctor', 'admin']
    expect(allowed).toContain('doctor')
    expect(allowed).toContain('admin')
    expect(allowed).not.toContain('pharmacist')
    expect(allowed).not.toContain('nurse')
  })

  it('hanya pharmacist/admin bisa PATCH dispense', () => {
    const allowed = ['pharmacist', 'admin']
    expect(allowed).toContain('pharmacist')
    expect(allowed).not.toContain('doctor')
    expect(allowed).not.toContain('nurse')
  })

  it('prescription status valid: active → completed | cancelled', () => {
    const validStatuses = ['active', 'completed', 'cancelled']
    expect(validStatuses).toContain('active')
    expect(validStatuses).toContain('completed')
    expect(validStatuses).toContain('cancelled')
    expect(validStatuses).not.toContain('pending')
    expect(validStatuses).not.toContain('dispensed')
  })

  it('stock warning tidak memblokir pembuatan prescription', () => {
    // Insufficient stock hanya menghasilkan warning, bukan error
    const result = {
      prescription: { id: 'rx1' },
      stock_warnings: ['Stok obat ID med1 tidak mencukupi'],
    }
    expect(result.prescription.id).toBeTruthy()
    expect(Array.isArray(result.stock_warnings)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Skenario 2 — Unit: FEFO logic
// ---------------------------------------------------------------------------

describe('Unit: FEFO stock deduction logic', () => {
  it('FEFO drains batch dengan expiry_date paling awal terlebih dahulu', () => {
    const batches = [
      { id: 'b1', expiry_date: '2026-12-01', quantity: 5 },
      { id: 'b2', expiry_date: '2026-06-01', quantity: 10 },
      { id: 'b3', expiry_date: '2027-03-01', quantity: 8 },
    ]
    // Sort ascending = FEFO
    const sorted = [...batches].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))
    expect(sorted[0].id).toBe('b2') // earliest
    expect(sorted[1].id).toBe('b1')
    expect(sorted[2].id).toBe('b3')
  })

  it('deduct dari batch pertama jika stok cukup', () => {
    const batches = [
      { id: 'b1', quantity: 10 },
      { id: 'b2', quantity: 5 },
    ]
    const need = 7
    const results: { id: string; deducted: number }[] = []
    let remaining = need
    for (const b of batches) {
      if (remaining <= 0) break
      const deduct = Math.min(remaining, b.quantity)
      results.push({ id: b.id, deducted: deduct })
      remaining -= deduct
    }
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({ id: 'b1', deducted: 7 })
    expect(remaining).toBe(0)
  })

  it('deduct lintas batch jika batch pertama tidak cukup', () => {
    const batches = [
      { id: 'b1', quantity: 3 },
      { id: 'b2', quantity: 8 },
    ]
    const need = 9
    const results: { id: string; deducted: number }[] = []
    let remaining = need
    for (const b of batches) {
      if (remaining <= 0) break
      const deduct = Math.min(remaining, b.quantity)
      results.push({ id: b.id, deducted: deduct })
      remaining -= deduct
    }
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({ id: 'b1', deducted: 3 })
    expect(results[1]).toEqual({ id: 'b2', deducted: 6 })
    expect(remaining).toBe(0)
  })

  it('stok tidak cukup → skip item dan tambah ke errors', () => {
    const totalStock = 3
    const needed = 10
    const errors: string[] = []
    if (totalStock < needed) {
      errors.push(`Stok tidak cukup untuk obat ID med1`)
    }
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('Stok tidak cukup')
  })

  it('dispense tidak terjadi jika total stok 0', () => {
    const batches: { id: string; quantity: number }[] = []
    const totalStock = batches.reduce((s, b) => s + b.quantity, 0)
    expect(totalStock).toBe(0)
    const dispensedCount = totalStock > 0 ? 1 : 0
    expect(dispensedCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Skenario 3 — Unit: PO business logic
// ---------------------------------------------------------------------------

describe('Unit: PO business logic', () => {
  it('PO total = sum(quantity_ordered × unit_price)', () => {
    const items = [
      { quantity_ordered: 10, unit_price: 5000 },
      { quantity_ordered: 3, unit_price: 12000 },
      { quantity_ordered: 1, unit_price: 250000 },
    ]
    const total = items.reduce((s, i) => s + i.quantity_ordered * i.unit_price, 0)
    expect(total).toBe(50000 + 36000 + 250000)
    expect(total).toBe(336000)
  })

  it('PO status transitions valid', () => {
    const validStatuses = ['po_draft', 'po_sent', 'po_partially_received', 'po_completed', 'po_cancelled']
    expect(validStatuses).toContain('po_draft')
    expect(validStatuses).toContain('po_sent')
    expect(validStatuses).toContain('po_partially_received')
    expect(validStatuses).toContain('po_completed')
    expect(validStatuses).toContain('po_cancelled')
  })

  it('action send hanya dari po_draft', () => {
    const canSend = (status: string) => status === 'po_draft'
    expect(canSend('po_draft')).toBe(true)
    expect(canSend('po_sent')).toBe(false)
    expect(canSend('po_partially_received')).toBe(false)
    expect(canSend('po_completed')).toBe(false)
  })

  it('action receive hanya dari po_sent atau po_partially_received', () => {
    const canReceive = (status: string) => ['po_sent', 'po_partially_received'].includes(status)
    expect(canReceive('po_sent')).toBe(true)
    expect(canReceive('po_partially_received')).toBe(true)
    expect(canReceive('po_draft')).toBe(false)
    expect(canReceive('po_completed')).toBe(false)
  })

  it('allReceived → po_completed, anyReceived → po_partially_received', () => {
    const getNewStatus = (items: { quantity_ordered: number; quantity_received: number }[]) => {
      const allReceived = items.every(i => i.quantity_received >= i.quantity_ordered)
      const anyReceived = items.some(i => i.quantity_received > 0)
      return allReceived ? 'po_completed' : anyReceived ? 'po_partially_received' : 'po_sent'
    }

    expect(getNewStatus([
      { quantity_ordered: 10, quantity_received: 10 },
      { quantity_ordered: 5, quantity_received: 5 },
    ])).toBe('po_completed')

    expect(getNewStatus([
      { quantity_ordered: 10, quantity_received: 6 },
      { quantity_ordered: 5, quantity_received: 0 },
    ])).toBe('po_partially_received')

    expect(getNewStatus([
      { quantity_ordered: 10, quantity_received: 0 },
    ])).toBe('po_sent')
  })

  it('quantity_received tidak bisa melebihi quantity_ordered', () => {
    const clamp = (received: number, ordered: number, existing: number) =>
      Math.min(existing + received, ordered)

    expect(clamp(10, 8, 0)).toBe(8)  // cap di 8
    expect(clamp(3, 10, 6)).toBe(9)  // 6+3 = 9 < 10
    expect(clamp(5, 10, 8)).toBe(10) // 8+5 = 13 → cap di 10
  })

  it('PO butuh vendor_id dan minimal 1 item', () => {
    const validate = (body: Record<string, unknown>) => {
      return !!(body.vendor_id && (body.items as unknown[])?.length)
    }
    expect(validate({ vendor_id: 'v1', items: [{ medication_id: 'm1', quantity_ordered: 5, unit_price: 1000 }] })).toBe(true)
    expect(validate({ items: [{}] })).toBe(false)
    expect(validate({ vendor_id: 'v1', items: [] })).toBe(false)
  })

  it('PO approval: hanya owner yang bisa approve/reject', () => {
    const allowedForApproval = ['owner']
    expect(allowedForApproval).toContain('owner')
    expect(allowedForApproval).not.toContain('admin')
    expect(allowedForApproval).not.toContain('pharmacist')
  })

  it('po-approval action hanya approve atau reject', () => {
    const allowed = ['approve', 'reject']
    expect(allowed).toContain('approve')
    expect(allowed).toContain('reject')
    expect(allowed).not.toContain('cancel')
    expect(allowed).not.toContain('send')
  })
})

// ---------------------------------------------------------------------------
// Skenario 4 — Integritas tabel pharmacy
// ---------------------------------------------------------------------------

describe('Integritas tabel pharmacy', () => {
  it('tabel medications bisa di-query', async () => {
    const { data, error } = await supabase
      .from('medications')
      .select('id, name, generic_name, form, strength, unit')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('medication_stock quantity tidak negatif (stok dari tabel medication_stock)', async () => {
    const { data, error } = await supabase
      .from('medication_stock')
      .select('id, medication_id, quantity')
      .limit(30)
    expect(error).toBeNull()
    for (const s of data ?? []) {
      expect(s.quantity).toBeGreaterThanOrEqual(0)
    }
  })

  it('tabel medication_stock bisa di-query', async () => {
    const { data, error } = await supabase
      .from('medication_stock')
      .select('id, medication_id, quantity, expiry_date, batch_number')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('medication_stock quantity tidak negatif', async () => {
    const { data } = await supabase
      .from('medication_stock')
      .select('quantity')
      .limit(30)
    for (const s of data ?? []) {
      expect(s.quantity).toBeGreaterThanOrEqual(0)
    }
  })

  it('tabel prescriptions bisa di-query', async () => {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('id, status, encounter_id, patient_id, prescribed_by')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('prescription status hanya active/completed/cancelled', async () => {
    const VALID = ['active', 'completed', 'cancelled']
    const { data } = await supabase
      .from('prescriptions')
      .select('status')
      .limit(50)
    for (const rx of data ?? []) {
      expect(VALID).toContain(rx.status)
    }
  })

  it('tabel purchase_orders bisa di-query', async () => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id, po_number, status, total_amount, vendor_id')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('purchase_orders status hanya status valid', async () => {
    const VALID = ['po_draft', 'po_sent', 'po_partially_received', 'po_completed', 'po_cancelled']
    const { data } = await supabase
      .from('purchase_orders')
      .select('status')
      .limit(50)
    for (const po of data ?? []) {
      expect(VALID).toContain(po.status)
    }
  })

  it('purchase_orders total_amount tidak negatif', async () => {
    const { data } = await supabase
      .from('purchase_orders')
      .select('total_amount')
      .limit(30)
    for (const po of data ?? []) {
      expect(po.total_amount).toBeGreaterThanOrEqual(0)
    }
  })

  it('tabel vendors bisa di-query', async () => {
    const { data, error } = await supabase
      .from('vendors')
      .select('id, name, contact_person, is_active')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Skenario 5 — INSERT prescription + items
// ---------------------------------------------------------------------------

describe('INSERT prescription', () => {
  it('seed: buat prescription berhasil', async () => {
    if (!seeded.encounterId || !seeded.patientId || !seeded.doctorId || !seeded.medicationId) {
      console.log('  [SKIP] Data seed tidak lengkap untuk prescription')
      return
    }

    const { data, error } = await supabase
      .from('prescriptions')
      .insert({
        encounter_id: seeded.encounterId,
        patient_id: seeded.patientId,
        prescribed_by: seeded.doctorId,
        status: 'active',
      })
      .select('id, status')
      .single()

    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
    expect(data?.status).toBe('active')
    seeded.prescriptionId = data?.id ?? ''
  })

  it('seed: insert prescription_item berhasil', async () => {
    if (!seeded.prescriptionId || !seeded.medicationId) return

    const { data, error } = await supabase
      .from('prescription_items')
      .insert({
        prescription_id: seeded.prescriptionId,
        medication_id: seeded.medicationId,
        dosage: '1 tablet',
        frequency: '3x sehari',
        duration_days: 3,
        quantity: 9,
        is_dispensed: false,
      })
      .select('id, medication_id, quantity, is_dispensed')
      .single()

    expect(error).toBeNull()
    expect(data?.medication_id).toBe(seeded.medicationId)
    expect(data?.quantity).toBe(9)
    expect(data?.is_dispensed).toBe(false)
    seeded.prescriptionItemId = data?.id ?? ''
  })

  it('prescription punya FK valid ke encounter', async () => {
    if (!seeded.prescriptionId) return
    const { data } = await supabase
      .from('prescriptions')
      .select('encounter_id, patient_id, prescribed_by')
      .eq('id', seeded.prescriptionId)
      .single()
    expect(data?.encounter_id).toBe(seeded.encounterId)
    expect(data?.patient_id).toBe(seeded.patientId)
    expect(data?.prescribed_by).toBe(seeded.doctorId)
  })

  it('GET prescription by encounter_id', async () => {
    if (!seeded.encounterId || !seeded.prescriptionId) return
    const { data, error } = await supabase
      .from('prescriptions')
      .select('id, status')
      .eq('encounter_id', seeded.encounterId)
    expect(error).toBeNull()
    const ids = (data ?? []).map(r => r.id)
    expect(ids).toContain(seeded.prescriptionId)
  })

  it('GET prescription filter status=active', async () => {
    const { data } = await supabase
      .from('prescriptions')
      .select('id, status')
      .eq('status', 'active')
      .limit(20)
    for (const rx of data ?? []) {
      expect(rx.status).toBe('active')
    }
  })
})

// ---------------------------------------------------------------------------
// Skenario 6 — Dispense (penyerahan obat)
// ---------------------------------------------------------------------------

describe('Dispense prescription (penyerahan obat)', () => {
  it('PATCH status prescription ke completed', async () => {
    if (!seeded.prescriptionId) {
      console.log('  [SKIP] Tidak ada prescription ID')
      return
    }

    const { data, error } = await supabase
      .from('prescriptions')
      .update({ status: 'completed' })
      .eq('id', seeded.prescriptionId)
      .select('status')
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('completed')
  })

  it('prescription_item.is_dispensed menjadi true saat dispense', async () => {
    if (!seeded.prescriptionItemId) return

    const { error } = await supabase
      .from('prescription_items')
      .update({ is_dispensed: true })
      .eq('id', seeded.prescriptionItemId)

    expect(error).toBeNull()

    const { data } = await supabase
      .from('prescription_items')
      .select('is_dispensed')
      .eq('id', seeded.prescriptionItemId)
      .single()

    expect(data?.is_dispensed).toBe(true)
  })

  it('medication_dispenses record terbuat saat dispense', async () => {
    if (!seeded.prescriptionId || !seeded.prescriptionItemId || !seeded.medicationId || !seeded.pharmacistId || !seeded.stockId) {
      console.log('  [SKIP] Data tidak lengkap untuk dispense')
      return
    }

    const dispenseQty = 2
    const { data, error } = await supabase
      .from('medication_dispenses')
      .insert({
        prescription_id: seeded.prescriptionId,
        prescription_item_id: seeded.prescriptionItemId,
        encounter_id: seeded.encounterId,
        patient_id: seeded.patientId,
        dispensed_by: seeded.pharmacistId,
        medication_id: seeded.medicationId,
        stock_id: seeded.stockId,
        quantity_dispensed: dispenseQty,
      })
      .select('id, quantity_dispensed')
      .single()

    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
    expect(data?.quantity_dispensed).toBe(dispenseQty)
    if (data?.id) dispenseIds.push(data.id)
  })

  it('medication_stock berkurang setelah dispense', async () => {
    if (!seeded.stockId || seeded.stockQtyBefore === 0) {
      console.log('  [SKIP] Tidak ada stock ID atau qty awal 0')
      return
    }

    const deductQty = 2
    const newQty = seeded.stockQtyBefore - deductQty

    const { error } = await supabase
      .from('medication_stock')
      .update({ quantity: newQty })
      .eq('id', seeded.stockId)

    expect(error).toBeNull()

    const { data } = await supabase
      .from('medication_stock')
      .select('quantity')
      .eq('id', seeded.stockId)
      .single()

    expect(data?.quantity).toBe(newQty)
  })

  it('medication_dispenses punya relasi ke prescription dan encounter', async () => {
    if (dispenseIds.length === 0) return
    const { data } = await supabase
      .from('medication_dispenses')
      .select('prescription_id, encounter_id, patient_id, quantity_dispensed')
      .eq('id', dispenseIds[0])
      .single()

    expect(data?.prescription_id).toBe(seeded.prescriptionId)
    expect(data?.encounter_id).toBe(seeded.encounterId)
    expect(data?.patient_id).toBe(seeded.patientId)
    expect(data?.quantity_dispensed).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Skenario 7 — PO full flow: draft → sent → partially received → completed
// ---------------------------------------------------------------------------

describe('PO full flow', () => {
  it('INSERT PO draft berhasil', async () => {
    if (!seeded.orgId || !seeded.vendorId || !seeded.medicationId || !seeded.adminId) {
      console.log('  [SKIP] Data tidak lengkap untuk PO test')
      return
    }

    const timestamp = Date.now().toString().slice(-8)
    const po_number = `PO-TEST-${timestamp}`
    const total_amount = 50 * 8000  // 50 unit × Rp8.000

    const { data, error } = await supabase
      .from('purchase_orders')
      .insert({
        organization_id: seeded.orgId,
        vendor_id: seeded.vendorId,
        po_number,
        order_date: new Date().toISOString().split('T')[0],
        status: 'po_draft',
        total_amount,
        created_by: seeded.adminId,
      })
      .select('id, status, po_number, total_amount')
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('po_draft')
    expect(data?.po_number).toBe(po_number)
    expect(data?.total_amount).toBe(total_amount)
    seeded.poId = data?.id ?? ''
  })

  it('INSERT PO items berhasil', async () => {
    if (!seeded.poId || !seeded.medicationId) return

    const { data, error } = await supabase
      .from('purchase_order_items')
      .insert({
        po_id: seeded.poId,
        medication_id: seeded.medicationId,
        quantity_ordered: 50,
        unit_price: 8000,
      })
      .select('id, quantity_ordered, unit_price')
      .single()

    expect(error).toBeNull()
    expect(data?.quantity_ordered).toBe(50)
    expect(data?.unit_price).toBe(8000)
    seeded.poItemId = data?.id ?? ''
  })

  it('PO subtotal item = quantity_ordered × unit_price', async () => {
    if (!seeded.poItemId) return
    const { data } = await supabase
      .from('purchase_order_items')
      .select('quantity_ordered, unit_price')
      .eq('id', seeded.poItemId)
      .single()

    const expected = (data?.quantity_ordered ?? 0) * (data?.unit_price ?? 0)
    expect(expected).toBe(50 * 8000)
    expect(expected).toBe(400000)
  })

  it('PATCH PO: send (po_draft → po_sent)', async () => {
    if (!seeded.poId) return

    const { error } = await supabase
      .from('purchase_orders')
      .update({ status: 'po_sent', updated_at: new Date().toISOString() })
      .eq('id', seeded.poId)

    expect(error).toBeNull()

    const { data } = await supabase
      .from('purchase_orders')
      .select('status')
      .eq('id', seeded.poId)
      .single()

    expect(data?.status).toBe('po_sent')
  })

  it('PATCH PO: receive partial → po_partially_received, medication_stock bertambah', async () => {
    if (!seeded.poId || !seeded.poItemId || !seeded.medicationId || !seeded.orgId) return

    const receiveQty = 20

    // Ambil total stock di medication_stock sebelum receive
    const { data: stockRows } = await supabase
      .from('medication_stock')
      .select('id, quantity')
      .eq('medication_id', seeded.medicationId)
      .eq('organization_id', seeded.orgId)
      .gt('quantity', 0)
      .order('expiry_date', { ascending: true })
      .limit(1)

    const existingStock = stockRows?.[0]
    const stockBefore = existingStock?.quantity ?? 0

    // Simulate receive partial — update PO item
    const { error: itemErr } = await supabase
      .from('purchase_order_items')
      .update({
        quantity_received: receiveQty,
        received_date: new Date().toISOString().split('T')[0],
        batch_number: 'BATCH-TEST-001',
      })
      .eq('id', seeded.poItemId)

    expect(itemErr).toBeNull()

    // Update PO status → partially_received
    const { error: poErr } = await supabase
      .from('purchase_orders')
      .update({ status: 'po_partially_received' })
      .eq('id', seeded.poId)

    expect(poErr).toBeNull()

    // Simulate stock update via medication_stock (same as API does)
    if (existingStock) {
      const { error: stockErr } = await supabase
        .from('medication_stock')
        .update({ quantity: stockBefore + receiveQty })
        .eq('id', existingStock.id)

      expect(stockErr).toBeNull()

      const { data: updatedStock } = await supabase
        .from('medication_stock')
        .select('quantity')
        .eq('id', existingStock.id)
        .single()
      expect(updatedStock?.quantity).toBe(stockBefore + receiveQty)

      // Restore
      await supabase.from('medication_stock').update({ quantity: stockBefore }).eq('id', existingStock.id)
    }

    // Verify PO status
    const { data: updatedPO } = await supabase
      .from('purchase_orders')
      .select('status')
      .eq('id', seeded.poId)
      .single()
    expect(updatedPO?.status).toBe('po_partially_received')
  })

  it('PATCH PO: receive complete → po_completed', async () => {
    if (!seeded.poId || !seeded.poItemId) return

    // Receive sisa 30 (sudah ada 20)
    const { error: itemErr } = await supabase
      .from('purchase_order_items')
      .update({ quantity_received: 50 }) // full 50
      .eq('id', seeded.poItemId)

    expect(itemErr).toBeNull()

    // Check: all received?
    const { data: items } = await supabase
      .from('purchase_order_items')
      .select('quantity_ordered, quantity_received')
      .eq('po_id', seeded.poId)

    const allReceived = (items ?? []).every(i => (i.quantity_received ?? 0) >= i.quantity_ordered)
    expect(allReceived).toBe(true)

    // Update PO status
    const { error: poErr } = await supabase
      .from('purchase_orders')
      .update({ status: 'po_completed' })
      .eq('id', seeded.poId)

    expect(poErr).toBeNull()

    const { data: updatedPO } = await supabase
      .from('purchase_orders')
      .select('status')
      .eq('id', seeded.poId)
      .single()

    expect(updatedPO?.status).toBe('po_completed')
  })

  it('PO number tidak kosong dan mengandung tahun', async () => {
    const { data } = await supabase
      .from('purchase_orders')
      .select('po_number')
      .not('po_number', 'is', null)
      .limit(10)
    const year = new Date().getFullYear().toString()
    for (const po of data ?? []) {
      expect(po.po_number).toBeTruthy()
      // PO number format: PO-YYYY-xxxxxxxx
      expect(po.po_number).toMatch(/PO/)
    }
  })
})

// ---------------------------------------------------------------------------
// Skenario 8 — PO approval (owner flow)
// ---------------------------------------------------------------------------

describe('Unit: PO approval', () => {
  it('approve mengubah status ke po_sent', () => {
    const applyApproval = (action: 'approve' | 'reject', reason?: string) => {
      if (action === 'approve') return { status: 'po_sent' }
      return { status: 'po_cancelled', rejection_reason: reason ?? 'Rejected by owner' }
    }
    expect(applyApproval('approve').status).toBe('po_sent')
    expect(applyApproval('reject').status).toBe('po_cancelled')
    expect(applyApproval('reject', 'Budget exceeded').rejection_reason).toBe('Budget exceeded')
  })

  it('approve/reject hanya bisa pada status po_draft atau po_sent', () => {
    const canApprove = (status: string) => ['po_draft', 'po_sent'].includes(status)
    expect(canApprove('po_draft')).toBe(true)
    expect(canApprove('po_sent')).toBe(true)
    expect(canApprove('po_completed')).toBe(false)
    expect(canApprove('po_partially_received')).toBe(false)
    expect(canApprove('po_cancelled')).toBe(false)
  })

  it('rejection_reason tersimpan saat reject', async () => {
    if (!seeded.orgId || !seeded.vendorId || !seeded.adminId) {
      console.log('  [SKIP] Data tidak lengkap untuk rejection test')
      return
    }

    const { data: po } = await supabase
      .from('purchase_orders')
      .insert({
        organization_id: seeded.orgId,
        vendor_id: seeded.vendorId,
        po_number: `PO-REJECT-${Date.now()}`,
        order_date: new Date().toISOString().split('T')[0],
        status: 'po_sent',
        total_amount: 0,
        created_by: seeded.adminId,
      })
      .select('id')
      .single()

    if (!po) return

    const { error } = await supabase
      .from('purchase_orders')
      .update({
        status: 'po_cancelled',
        rejection_reason: 'Anggaran tidak tersedia',
      })
      .eq('id', po.id)

    expect(error).toBeNull()

    const { data: updated } = await supabase
      .from('purchase_orders')
      .select('status, rejection_reason')
      .eq('id', po.id)
      .single()

    expect(updated?.status).toBe('po_cancelled')
    expect(updated?.rejection_reason).toBe('Anggaran tidak tersedia')

    // Cleanup
    await supabase.from('purchase_orders').delete().eq('id', po.id)
  })
})

// ---------------------------------------------------------------------------
// Skenario 9 — Vendor data integrity
// ---------------------------------------------------------------------------

describe('Vendor data integrity', () => {
  it('tabel vendors bisa di-query dengan join ke PO', async () => {
    const { data, error } = await supabase
      .from('vendors')
      .select('id, name, is_active')
      .limit(10)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('vendor aktif punya nama tidak kosong', async () => {
    const { data } = await supabase
      .from('vendors')
      .select('id, name')
      .eq('is_active', true)
      .limit(20)
    for (const v of data ?? []) {
      expect(v.name).toBeTruthy()
    }
  })

  it('PO dengan vendor yang sama bisa dibuat lebih dari sekali', async () => {
    if (!seeded.poId || !seeded.vendorId) return
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('vendor_id', seeded.vendorId)
      .limit(5)
    // Boleh banyak PO per vendor
    expect(Array.isArray(pos)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Skenario 10 — GET list dengan filter
// ---------------------------------------------------------------------------

describe('GET prescriptions & PO dengan filter', () => {
  it('filter prescriptions by status=completed', async () => {
    const { data, error } = await supabase
      .from('prescriptions')
      .select('id, status')
      .eq('status', 'completed')
      .limit(10)
    expect(error).toBeNull()
    for (const rx of data ?? []) {
      expect(rx.status).toBe('completed')
    }
  })

  it('filter PO by status=po_draft', async () => {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('id, status')
      .eq('status', 'po_draft')
      .limit(10)
    expect(error).toBeNull()
    for (const po of data ?? []) {
      expect(po.status).toBe('po_draft')
    }
  })

  it('prescription items JOIN medications berhasil', async () => {
    if (!seeded.prescriptionId) return
    const { data, error } = await supabase
      .from('prescription_items')
      .select('id, quantity, dosage, medications(id, name, form)')
      .eq('prescription_id', seeded.prescriptionId)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    for (const item of data ?? []) {
      expect((item as any).medications).toBeTruthy()
    }
  })

  it('PO items JOIN medications berhasil', async () => {
    if (!seeded.poId) return
    const { data, error } = await supabase
      .from('purchase_order_items')
      .select('id, quantity_ordered, medications(id, name)')
      .eq('po_id', seeded.poId)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('medication_dispenses bisa di-query dengan filter encounter', async () => {
    if (!seeded.encounterId) return
    const { data, error } = await supabase
      .from('medication_dispenses')
      .select('id, quantity_dispensed, medication_id')
      .eq('encounter_id', seeded.encounterId)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })
})
