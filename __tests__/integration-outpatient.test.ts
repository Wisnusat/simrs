/**
 * Integration tests — Outpatient (Rawat Jalan) flow
 * Menggunakan Supabase service role key — bypass RLS
 *
 * Skenario:
 *   1. Ambil data antrian hari ini (GET queues)
 *   2. Cek encounter outpatient terbaru
 *   3. Cek vital signs tersimpan
 *   4. Cek invoice ter-generate (buildInvoiceFromEncounter logic)
 *   5. Cek allergy intolerance pasien
 *   6. Cek diagnoses (ICD-10) per encounter
 *   7. Cek clinical notes (SOAP) per encounter
 *   8. Cek duplicate encounter guard (appointment_id sama)
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Client setup
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let supabase: ReturnType<typeof createClient>

beforeAll(() => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib di .env')
  }
  supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
})

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function getFirstOrg() {
  const { data } = await supabase.from('organizations').select('id, name, medical_fee').limit(1).single()
  return data
}

async function getFirstPatient() {
  const { data } = await supabase
    .from('patients')
    .select('id, full_name, medical_record_no')
    .limit(1)
    .single()
  return data
}

async function getLatestOutpatientEncounter() {
  const { data } = await supabase
    .from('encounters')
    .select('id, patient_id, status, encounter_class, payment_type, organization_id, arrived_at')
    .eq('encounter_class', 'outpatient')
    .order('arrived_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

// ---------------------------------------------------------------------------
// Skenario 1 — Koneksi & data dasar
// ---------------------------------------------------------------------------

describe('Koneksi Supabase & data dasar', () => {
  it('Bisa connect ke Supabase dengan service role key', async () => {
    const { data, error } = await supabase.from('organizations').select('id').limit(1)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('Minimal 1 organisasi terdaftar', async () => {
    const org = await getFirstOrg()
    expect(org).toBeTruthy()
    expect(org?.id).toBeTruthy()
  })

  it('Minimal 1 pasien terdaftar', async () => {
    const patient = await getFirstPatient()
    expect(patient).toBeTruthy()
    expect(patient?.full_name).toBeTruthy()
    expect(patient?.medical_record_no).toBeTruthy()
  })

  it('Minimal 1 practitioner terdaftar', async () => {
    const { data } = await supabase
      .from('practitioners')
      .select('id, role, full_name')
      .limit(1)
      .single()
    expect(data).toBeTruthy()
    expect(['doctor', 'nurse', 'admin', 'cashier', 'pharmacist', 'lab_nurse', 'nutritionist', 'owner']).toContain(data?.role)
  })
})

// ---------------------------------------------------------------------------
// Skenario 2 — Antrian (Queue)
// ---------------------------------------------------------------------------

describe('Antrian rawat jalan', () => {
  it('Tabel queues bisa di-query', async () => {
    const { data, error } = await supabase
      .from('queues')
      .select('id, queue_number, status, patient_id, queue_date')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('Semua antrian punya status valid', async () => {
    const VALID = ['waiting', 'called', 'in_service', 'done', 'skipped']
    const { data } = await supabase
      .from('queues')
      .select('id, status')
      .limit(50)
    for (const q of data ?? []) {
      expect(VALID).toContain(q.status)
    }
  })

  it('Queue number format tidak kosong', async () => {
    const { data } = await supabase
      .from('queues')
      .select('queue_number')
      .not('queue_number', 'is', null)
      .limit(10)
    for (const q of data ?? []) {
      expect(q.queue_number).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// Skenario 3 — Encounter Outpatient
// ---------------------------------------------------------------------------

describe('Encounter rawat jalan', () => {
  it('Ada encounter dengan encounter_class = outpatient', async () => {
    const enc = await getLatestOutpatientEncounter()
    // Bisa null jika belum ada kunjungan — skip tidak fail
    if (!enc) {
      console.log('  [SKIP] Belum ada encounter outpatient di database')
      return
    }
    expect(enc.encounter_class).toBe('outpatient')
    expect(enc.patient_id).toBeTruthy()
    expect(enc.organization_id).toBeTruthy()
  })

  it('Encounter outpatient punya payment_type umum atau bpjs', async () => {
    const enc = await getLatestOutpatientEncounter()
    if (!enc) return
    expect(['umum', 'bpjs', 'general']).toContain(enc.payment_type)
  })

  it('Encounter status valid', async () => {
    const VALID = ['planned', 'arrived', 'in_progress', 'waiting_lab', 'admitted', 'finished', 'cancelled']
    const { data } = await supabase
      .from('encounters')
      .select('id, status')
      .eq('encounter_class', 'outpatient')
      .limit(20)
    for (const e of data ?? []) {
      expect(VALID).toContain(e.status)
    }
  })

  it('Tidak ada duplicate encounter untuk appointment_id yang sama', async () => {
    const { data } = await supabase
      .from('encounters')
      .select('appointment_id')
      .not('appointment_id', 'is', null)
      .limit(100)

    const ids = (data ?? []).map(e => e.appointment_id).filter(Boolean)
    const unique = new Set(ids)
    expect(ids.length).toBe(unique.size)
  })
})

// ---------------------------------------------------------------------------
// Skenario 4 — Vital Signs
// ---------------------------------------------------------------------------

describe('Vital signs rawat jalan', () => {
  it('Tabel vital_signs bisa di-query', async () => {
    const { data, error } = await supabase
      .from('vital_signs')
      .select('id, encounter_id, systolic_bp, heart_rate, temperature, recorded_at')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('Vital signs terbaru punya encounter_id valid', async () => {
    const enc = await getLatestOutpatientEncounter()
    if (!enc) return

    const { data } = await supabase
      .from('vital_signs')
      .select('id, systolic_bp, heart_rate, temperature, oxygen_saturation')
      .eq('encounter_id', enc.id)
      .limit(5)

    if ((data ?? []).length === 0) {
      console.log('  [INFO] Encounter ini belum ada vital signs')
      return
    }

    for (const vs of data ?? []) {
      if (vs.systolic_bp !== null) expect(vs.systolic_bp).toBeGreaterThan(0)
      if (vs.heart_rate !== null) expect(vs.heart_rate).toBeGreaterThan(0)
      if (vs.temperature !== null) {
        expect(vs.temperature).toBeGreaterThan(30)
        expect(vs.temperature).toBeLessThan(45)
      }
      if (vs.oxygen_saturation !== null) {
        expect(vs.oxygen_saturation).toBeGreaterThanOrEqual(50)
        expect(vs.oxygen_saturation).toBeLessThanOrEqual(100)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Skenario 5 — Diagnoses (ICD-10)
// ---------------------------------------------------------------------------

describe('Diagnoses rawat jalan', () => {
  it('Tabel diagnoses bisa di-query', async () => {
    const { data, error } = await supabase
      .from('diagnoses')
      .select('id, icd10_code, icd10_display, diagnosis_type')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('Diagnosis type hanya primary/secondary/comorbidity', async () => {
    const VALID = ['primary', 'secondary', 'comorbidity']
    const { data } = await supabase
      .from('diagnoses')
      .select('id, diagnosis_type')
      .limit(30)
    for (const d of data ?? []) {
      expect(VALID).toContain(d.diagnosis_type)
    }
  })

  it('ICD-10 code tidak kosong', async () => {
    const { data } = await supabase
      .from('diagnoses')
      .select('icd10_code, icd10_display')
      .limit(20)
    for (const d of data ?? []) {
      expect(d.icd10_code).toBeTruthy()
      expect(d.icd10_display).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// Skenario 6 — Clinical Notes (SOAP)
// ---------------------------------------------------------------------------

describe('Clinical notes (SOAP) rawat jalan', () => {
  it('Tabel clinical_notes bisa di-query', async () => {
    const { data, error } = await supabase
      .from('clinical_notes')
      .select('id, subjective, objective, assessment, plan, writer_role')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('writer_role hanya role valid', async () => {
    const VALID = ['doctor', 'nurse', 'admin', 'nutritionist']
    const { data } = await supabase
      .from('clinical_notes')
      .select('writer_role')
      .limit(30)
    for (const n of data ?? []) {
      if (n.writer_role) expect(VALID).toContain(n.writer_role)
    }
  })
})

// ---------------------------------------------------------------------------
// Skenario 7 — Invoice rawat jalan
// ---------------------------------------------------------------------------

describe('Invoice rawat jalan', () => {
  it('Tabel invoices bisa di-query', async () => {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, status, total_amount, payment_type')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('Invoice status valid', async () => {
    const VALID = ['unpaid', 'paid', 'bpjs_claim_pending', 'cancelled']
    const { data } = await supabase
      .from('invoices')
      .select('id, status')
      .limit(30)
    for (const inv of data ?? []) {
      expect(VALID).toContain(inv.status)
    }
  })

  it('Invoice total_amount tidak negatif', async () => {
    const { data } = await supabase
      .from('invoices')
      .select('id, total_amount, subtotal')
      .limit(30)
    for (const inv of data ?? []) {
      expect(inv.total_amount).toBeGreaterThanOrEqual(0)
      expect(inv.subtotal).toBeGreaterThanOrEqual(0)
    }
  })

  it('Invoice outpatient punya encounter_id', async () => {
    const { data } = await supabase
      .from('invoices')
      .select('id, encounter_id, episode_of_care_id')
      .is('episode_of_care_id', null)
      .limit(10)
    for (const inv of data ?? []) {
      expect(inv.encounter_id).toBeTruthy()
    }
  })

  it('Invoice items amount konsisten dengan invoice total', async () => {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id, subtotal')
      .eq('status', 'unpaid')
      .limit(5)

    for (const inv of invoices ?? []) {
      const { data: items } = await supabase
        .from('invoice_items')
        .select('quantity, unit_price')
        .eq('invoice_id', inv.id)

      if ((items ?? []).length === 0) continue

      const computed = (items ?? []).reduce((s, i) => s + i.quantity * i.unit_price, 0)
      // Toleransi 1 rupiah untuk floating point
      expect(Math.abs(computed - inv.subtotal)).toBeLessThanOrEqual(1)
    }
  })
})

// ---------------------------------------------------------------------------
// Skenario 8 — Allergy Intolerance
// ---------------------------------------------------------------------------

describe('Allergy intolerance', () => {
  it('Tabel allergy_intolerances bisa di-query', async () => {
    const { data, error } = await supabase
      .from('allergy_intolerances')
      .select('id, patient_id, substance_display, category, criticality')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('Category hanya medication/food/environment', async () => {
    const VALID = ['medication', 'food', 'environment']
    const { data } = await supabase
      .from('allergy_intolerances')
      .select('category')
      .limit(30)
    for (const a of data ?? []) {
      if (a.category) expect(VALID).toContain(a.category)
    }
  })

  it('Criticality hanya low/high/unable-to-assess', async () => {
    const VALID = ['low', 'high', 'unable-to-assess']
    const { data } = await supabase
      .from('allergy_intolerances')
      .select('criticality')
      .limit(30)
    for (const a of data ?? []) {
      if (a.criticality) expect(VALID).toContain(a.criticality)
    }
  })
})
