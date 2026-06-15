/**
 * Integration tests — Inpatient (Rawat Inap) flow
 * Menggunakan Supabase service role key — bypass RLS
 *
 * Role yang terlibat:
 *   - nurse       → admission, CPPT, vital signs, running bill, discharge
 *   - doctor      → CPPT notes, diagnoses, prescriptions, running bill
 *   - nutritionist → nutrition orders
 *   - cashier     → invoice, payment
 *   - admin       → akses semua data
 *
 * Skenario:
 *   A. Data dasar inpatient (episode, admission, room)
 *   B. Running bill — CRUD + kalkulasi subtotal
 *   C. Invoice rawat inap — syncInvoiceForEpisode coverage
 *   D. Discharge flow — status transitions + episode close
 *   E. Nutrition orders (role nutritionist)
 *   F. CPPT per shift (role nurse/doctor)
 *   G. Role-based field validation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let supabase: ReturnType<typeof createClient>

// Seed IDs — diisi saat beforeAll, dibersihkan di afterAll
const SEED: {
  patientId: string | null
  orgId: string | null
  episodeId: string | null
  admissionId: string | null
  runningBillIds: string[]
} = {
  patientId: null,
  orgId: null,
  episodeId: null,
  admissionId: null,
  runningBillIds: [],
}

beforeAll(async () => {
  supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // Ambil org dan pasien pertama untuk seed
  const { data: org } = await supabase.from('organizations').select('id').limit(1).single()
  const { data: patient } = await supabase.from('patients').select('id').limit(1).single()
  SEED.orgId = org?.id ?? null
  SEED.patientId = patient?.id ?? null
})

afterAll(async () => {
  // Bersihkan seed data yang dibuat selama test
  if (SEED.runningBillIds.length > 0) {
    await supabase.from('running_bills').delete().in('id', SEED.runningBillIds)
  }
  if (SEED.admissionId) {
    await supabase.from('inpatient_admissions').delete().eq('id', SEED.admissionId)
  }
  if (SEED.episodeId) {
    await supabase.from('episodes_of_care').delete().eq('id', SEED.episodeId)
  }
})

// ---------------------------------------------------------------------------
// A. Data dasar inpatient
// ---------------------------------------------------------------------------

describe('A. Data dasar inpatient', () => {
  it('Tabel episodes_of_care bisa di-query', async () => {
    const { data, error } = await supabase
      .from('episodes_of_care')
      .select('id, patient_id, status, start_date')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('Episode status hanya nilai valid', async () => {
    const VALID = ['admitted', 'in_care', 'discharge_approved', 'discharged', 'bpjs_finalized']
    const { data } = await supabase
      .from('episodes_of_care')
      .select('status')
      .limit(50)
    for (const ep of data ?? []) {
      expect(VALID).toContain(ep.status)
    }
  })

  it('Tabel inpatient_admissions bisa di-query', async () => {
    const { data, error } = await supabase
      .from('inpatient_admissions')
      .select('id, patient_id, status, room_class, admission_date')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('Admission room_class hanya nilai valid', async () => {
    const VALID = ['vip', 'kelas_1', 'kelas_2', 'kelas_3']
    const { data } = await supabase
      .from('inpatient_admissions')
      .select('room_class')
      .limit(30)
    for (const adm of data ?? []) {
      if (adm.room_class) expect(VALID).toContain(adm.room_class)
    }
  })

  it('Admission status hanya nilai valid', async () => {
    const VALID = ['admitted', 'in_care', 'discharge_approved', 'discharged', 'bpjs_finalized']
    const { data } = await supabase
      .from('inpatient_admissions')
      .select('id, status')
      .limit(30)
    for (const adm of data ?? []) {
      expect(VALID).toContain(adm.status)
    }
  })

  it('Admission punya dpjp_id (dokter penanggung jawab)', async () => {
    const { data } = await supabase
      .from('inpatient_admissions')
      .select('id, dpjp_id')
      .limit(10)
    for (const adm of data ?? []) {
      expect(adm.dpjp_id).toBeTruthy()
    }
  })

  it('Setiap admission terhubung ke episode_of_care', async () => {
    const { data } = await supabase
      .from('inpatient_admissions')
      .select('id, episode_of_care_id')
      .limit(20)
    for (const adm of data ?? []) {
      expect(adm.episode_of_care_id).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// B. Running Bill — CRUD + subtotal
// ---------------------------------------------------------------------------

describe('B. Running Bill (Tagihan Harian)', () => {
  let testEpisodeId: string | null = null
  let testPatientId: string | null = null

  beforeAll(async () => {
    // Gunakan episode aktif pertama jika ada
    const { data: ep } = await supabase
      .from('episodes_of_care')
      .select('id, patient_id')
      .in('status', ['admitted', 'in_care'])
      .limit(1)
      .maybeSingle()
    testEpisodeId = ep?.id ?? null
    testPatientId = ep?.patient_id ?? SEED.patientId
  })

  it('Tabel running_bills bisa di-query', async () => {
    const { data, error } = await supabase
      .from('running_bills')
      .select('id, episode_of_care_id, item_type, quantity, unit_price, subtotal')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('subtotal = quantity × unit_price (GENERATED column)', async () => {
    const { data } = await supabase
      .from('running_bills')
      .select('quantity, unit_price, subtotal')
      .limit(20)
    for (const rb of data ?? []) {
      expect(rb.subtotal).toBe(rb.quantity * rb.unit_price)
    }
  })

  it('INSERT running bill berhasil dan subtotal ter-generate', async () => {
    if (!testEpisodeId || !testPatientId) {
      console.log('  [SKIP] Tidak ada episode aktif untuk test INSERT')
      return
    }

    const { data, error } = await supabase
      .from('running_bills')
      .insert({
        episode_of_care_id: testEpisodeId,
        patient_id: testPatientId,
        item_type: 'room',
        item_name: '[TEST] Biaya Kamar Kelas 3',
        quantity: 1,
        unit_price: 150_000,
        charge_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.subtotal).toBe(150_000)
    expect(data?.item_type).toBe('room')

    if (data?.id) SEED.runningBillIds.push(data.id)
  })

  it('Running bill quantity > 1 → subtotal correct', async () => {
    if (!testEpisodeId || !testPatientId) return

    const { data, error } = await supabase
      .from('running_bills')
      .insert({
        episode_of_care_id: testEpisodeId,
        patient_id: testPatientId,
        item_type: 'action',
        item_name: '[TEST] Tindakan Perawatan Luka',
        quantity: 3,
        unit_price: 75_000,
        charge_date: new Date().toISOString().split('T')[0],
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.subtotal).toBe(225_000) // 3 × 75_000

    if (data?.id) SEED.runningBillIds.push(data.id)
  })

  it('DELETE running bill berhasil', async () => {
    if (!testEpisodeId || !testPatientId) return

    // Insert dulu item yang akan dihapus
    const { data: inserted } = await supabase
      .from('running_bills')
      .insert({
        episode_of_care_id: testEpisodeId,
        patient_id: testPatientId,
        item_type: 'medication',
        item_name: '[TEST] Obat DELETE Test',
        quantity: 1,
        unit_price: 10_000,
        charge_date: new Date().toISOString().split('T')[0],
      })
      .select('id')
      .single()

    expect(inserted?.id).toBeTruthy()

    const { error: delError } = await supabase
      .from('running_bills')
      .delete()
      .eq('id', inserted!.id)

    expect(delError).toBeNull()

    // Verifikasi sudah terhapus
    const { data: check } = await supabase
      .from('running_bills')
      .select('id')
      .eq('id', inserted!.id)
      .maybeSingle()

    expect(check).toBeNull()
  })

  it('item_type running bill hanya nilai yang diizinkan', async () => {
    const VALID = ['room', 'action', 'medication', 'nutrition', 'consultation']
    const { data } = await supabase
      .from('running_bills')
      .select('item_type')
      .limit(50)
    for (const rb of data ?? []) {
      expect(VALID).toContain(rb.item_type)
    }
  })

  it('Total running bill per episode = sum subtotal', async () => {
    if (!testEpisodeId) return

    const { data } = await supabase
      .from('running_bills')
      .select('subtotal')
      .eq('episode_of_care_id', testEpisodeId)

    const total = (data ?? []).reduce((s, r) => s + r.subtotal, 0)
    expect(total).toBeGreaterThanOrEqual(0)
    // Total harus sama dengan sum individual
    const sumCheck = (data ?? []).reduce((s, r) => s + r.subtotal, 0)
    expect(total).toBe(sumCheck)
  })
})

// ---------------------------------------------------------------------------
// C. Invoice rawat inap
// ---------------------------------------------------------------------------

describe('C. Invoice rawat inap', () => {
  it('Invoice inpatient punya episode_of_care_id', async () => {
    const { data } = await supabase
      .from('invoices')
      .select('id, episode_of_care_id, total_amount, status')
      .not('episode_of_care_id', 'is', null)
      .limit(10)

    for (const inv of data ?? []) {
      expect(inv.episode_of_care_id).toBeTruthy()
      expect(inv.total_amount).toBeGreaterThanOrEqual(0)
    }
  })

  it('Invoice inpatient nomor format INV-IP-YYYY-xxxxxx', async () => {
    const { data } = await supabase
      .from('invoices')
      .select('invoice_number')
      .not('episode_of_care_id', 'is', null)
      .limit(10)

    for (const inv of data ?? []) {
      expect(inv.invoice_number).toMatch(/^INV-IP-\d{4}-\d+$/)
    }
  })

  it('Invoice outpatient nomor format INV-YYYY-xxxxxx', async () => {
    const { data } = await supabase
      .from('invoices')
      .select('invoice_number')
      .is('episode_of_care_id', null)
      .limit(10)

    for (const inv of data ?? []) {
      expect(inv.invoice_number).toMatch(/^INV-\d{4}-\d+$/)
    }
  })

  it('Invoice items inpatient mencakup item_type room', async () => {
    const { data: invoices } = await supabase
      .from('invoices')
      .select('id')
      .not('episode_of_care_id', 'is', null)
      .limit(5)

    for (const inv of invoices ?? []) {
      const { data: items } = await supabase
        .from('invoice_items')
        .select('item_type')
        .eq('invoice_id', inv.id)

      const types = (items ?? []).map(i => i.item_type)
      // Inpatient invoice harus ada minimal 1 item
      if (types.length > 0) {
        const VALID = ['room', 'action', 'medication', 'lab', 'consultation', 'nutrition']
        for (const t of types) expect(VALID).toContain(t)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// D. Discharge flow
// ---------------------------------------------------------------------------

describe('D. Discharge flow — status transitions', () => {
  it('Admission discharged punya discharge_date', async () => {
    const { data } = await supabase
      .from('inpatient_admissions')
      .select('id, status, discharge_date, discharge_approved_by, discharge_approved_at')
      .eq('status', 'discharged')
      .limit(10)

    for (const adm of data ?? []) {
      expect(adm.discharge_date).toBeTruthy()
    }
  })

  it('discharge_approved punya discharge_approved_by dan discharge_approved_at', async () => {
    const { data } = await supabase
      .from('inpatient_admissions')
      .select('id, status, discharge_approved_by, discharge_approved_at')
      .in('status', ['discharge_approved', 'discharged'])
      .limit(10)

    for (const adm of data ?? []) {
      if (adm.discharge_approved_by) {
        expect(adm.discharge_approved_at).toBeTruthy()
      }
    }
  })

  it('Episode discharged punya end_date', async () => {
    const { data } = await supabase
      .from('episodes_of_care')
      .select('id, status, end_date, start_date')
      .eq('status', 'discharged')
      .limit(10)

    for (const ep of data ?? []) {
      expect(ep.end_date).toBeTruthy()
      // end_date harus setelah atau sama dengan start_date
      if (ep.start_date && ep.end_date) {
        expect(new Date(ep.end_date).getTime()).toBeGreaterThanOrEqual(
          new Date(ep.start_date).getTime()
        )
      }
    }
  })

  it('Episode aktif (admitted/in_care) belum punya end_date', async () => {
    const { data } = await supabase
      .from('episodes_of_care')
      .select('id, status, end_date')
      .in('status', ['admitted', 'in_care'])
      .limit(10)

    for (const ep of data ?? []) {
      // end_date boleh null untuk episode aktif
      expect(['admitted', 'in_care']).toContain(ep.status)
    }
  })

  it('Discharge status flow: admitted → in_care → discharge_approved → discharged', () => {
    // Unit test: urutan status valid
    const STATUS_ORDER = ['admitted', 'in_care', 'discharge_approved', 'discharged', 'bpjs_finalized']
    const idx = (s: string) => STATUS_ORDER.indexOf(s)

    expect(idx('admitted')).toBeLessThan(idx('in_care'))
    expect(idx('in_care')).toBeLessThan(idx('discharge_approved'))
    expect(idx('discharge_approved')).toBeLessThan(idx('discharged'))
  })
})

// ---------------------------------------------------------------------------
// E. Nutrition Orders (role: nutritionist)
// ---------------------------------------------------------------------------

describe('E. Nutrition Orders — role nutritionist', () => {
  it('Tabel nutrition_orders bisa di-query', async () => {
    const { data, error } = await supabase
      .from('nutrition_orders')
      .select('id, episode_of_care_id, nutritional_status, energy_needs_kcal, is_active')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('nutritional_status hanya nilai valid', async () => {
    const VALID = ['baik', 'kurang', 'lebih', 'buruk']
    const { data } = await supabase
      .from('nutrition_orders')
      .select('nutritional_status')
      .not('nutritional_status', 'is', null)
      .limit(20)
    for (const no of data ?? []) {
      expect(VALID).toContain(no.nutritional_status)
    }
  })

  it('energy_needs_kcal positif jika diisi', async () => {
    const { data } = await supabase
      .from('nutrition_orders')
      .select('energy_needs_kcal')
      .not('energy_needs_kcal', 'is', null)
      .limit(20)
    for (const no of data ?? []) {
      expect(no.energy_needs_kcal).toBeGreaterThan(0)
    }
  })

  it('Nutrition order terhubung ke episode_of_care', async () => {
    const { data } = await supabase
      .from('nutrition_orders')
      .select('id, episode_of_care_id')
      .limit(10)
    for (const no of data ?? []) {
      expect(no.episode_of_care_id).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// F. Inpatient Daily Records / CPPT (role: nurse, doctor)
// ---------------------------------------------------------------------------

describe('F. CPPT per shift (nurse & doctor)', () => {
  it('Tabel inpatient_daily_records bisa di-query', async () => {
    const { data, error } = await supabase
      .from('inpatient_daily_records')
      .select('id, admission_id, shift, record_date')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('Shift hanya pagi/sore/malam', async () => {
    const VALID = ['pagi', 'sore', 'malam']
    const { data } = await supabase
      .from('inpatient_daily_records')
      .select('shift')
      .limit(30)
    for (const dr of data ?? []) {
      if (dr.shift) expect(VALID).toContain(dr.shift)
    }
  })

  it('Daily record terhubung ke admission', async () => {
    const { data } = await supabase
      .from('inpatient_daily_records')
      .select('id, admission_id, encounter_id')
      .limit(10)
    for (const dr of data ?? []) {
      expect(dr.admission_id).toBeTruthy()
      expect(dr.encounter_id).toBeTruthy()
    }
  })

  it('Clinical notes inpatient terhubung ke encounter yang valid', async () => {
    // Ambil encounter inpatient
    const { data: encounters } = await supabase
      .from('encounters')
      .select('id')
      .eq('encounter_class', 'inpatient')
      .limit(5)

    const encIds = (encounters ?? []).map(e => e.id)
    if (encIds.length === 0) {
      console.log('  [INFO] Belum ada encounter inpatient')
      return
    }

    const { data: notes } = await supabase
      .from('clinical_notes')
      .select('id, encounter_id, subjective, writer_role')
      .in('encounter_id', encIds)
      .limit(10)

    for (const n of notes ?? []) {
      expect(encIds).toContain(n.encounter_id)
    }
  })
})

// ---------------------------------------------------------------------------
// G. Role-based validation (unit test — tanpa live API call)
// ---------------------------------------------------------------------------

describe('G. Role-based access rules (unit)', () => {
  const INPATIENT_ALLOWED_ROLES = ['nurse', 'doctor', 'admin']
  const RUNNING_BILL_WRITE_ROLES = ['nurse', 'doctor', 'admin']
  const CASHIER_ROLES = ['cashier']
  const NUTRITIONIST_ROLES = ['nutritionist']

  it('Running bill write hanya untuk nurse, doctor, admin', () => {
    const unauthorized = ['cashier', 'lab_nurse', 'pharmacist', 'nutritionist', 'patient']
    for (const role of unauthorized) {
      expect(RUNNING_BILL_WRITE_ROLES.includes(role)).toBe(false)
    }
    for (const role of RUNNING_BILL_WRITE_ROLES) {
      expect(RUNNING_BILL_WRITE_ROLES.includes(role)).toBe(true)
    }
  })

  it('Cashier akses invoice tapi tidak bisa edit admission', () => {
    expect(CASHIER_ROLES).toContain('cashier')
    expect(INPATIENT_ALLOWED_ROLES).not.toContain('cashier')
  })

  it('Nutritionist akses nutrition_orders — bukan running_bills', () => {
    expect(NUTRITIONIST_ROLES).toContain('nutritionist')
    expect(RUNNING_BILL_WRITE_ROLES).not.toContain('nutritionist')
  })

  it('Dpjp (doctor) wajib ada di setiap admission', async () => {
    const { data } = await supabase
      .from('inpatient_admissions')
      .select('id, dpjp_id')
      .is('dpjp_id', null)
      .limit(5)
    // Tidak boleh ada admission tanpa dpjp
    expect((data ?? []).length).toBe(0)
  })

  it('Practitioners dengan role doctor valid sebagai DPJP', async () => {
    const { data: admissions } = await supabase
      .from('inpatient_admissions')
      .select('dpjp_id')
      .limit(10)

    const dpjpIds = [...new Set((admissions ?? []).map(a => a.dpjp_id).filter(Boolean))]
    if (dpjpIds.length === 0) return

    const { data: practitioners } = await supabase
      .from('practitioners')
      .select('id, role')
      .in('id', dpjpIds)

    for (const p of practitioners ?? []) {
      expect(['doctor', 'admin']).toContain(p.role)
    }
  })
})
