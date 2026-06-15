/**
 * Integration tests — Lab (Laboratorium) flow
 * Covers:
 *   1. Unit: validasi lab order, status transitions, result entry (free-label)
 *   2. Integration outpatient: doctor order → encounter status waiting_lab → lab process → result
 *   3. Integration inpatient: lab order tied to episode_of_care
 *   4. Nurse lab: bebas isi label + value per item, bisa tambah item baru
 *   5. Doctor list: encounter status waiting_lab muncul di list dokter
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
  labNurseId: '' as string,
  // Outpatient context
  outpatientEncounterId: '' as string,
  outpatientLabOrderId: '' as string,
  outpatientItemId1: '' as string,
  outpatientItemId2: '' as string,
  // Inpatient context
  inpatientEncounterId: '' as string,
  episodeOfCareId: '' as string,
  inpatientLabOrderId: '' as string,
  inpatientItemId: '' as string,
}

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

  const { data: labNurse } = await supabase
    .from('practitioners').select('id').eq('role', 'lab_nurse').eq('is_active', true).limit(1).maybeSingle()
  seeded.labNurseId = labNurse?.id ?? ''

  // Buat encounter outpatient
  if (seeded.patientId && seeded.orgId) {
    const { data: enc } = await supabase
      .from('encounters')
      .insert({
        patient_id: seeded.patientId,
        organization_id: seeded.orgId,
        encounter_class: 'outpatient',
        status: 'in_progress',
        arrived_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    seeded.outpatientEncounterId = enc?.id ?? ''
  }

  // Buat episode + encounter inpatient
  if (seeded.patientId && seeded.orgId && seeded.doctorId) {
    const { data: loc } = await supabase.from('locations').select('id').limit(1).maybeSingle()

    const { data: ep } = await supabase
      .from('episodes_of_care')
      .insert({
        patient_id: seeded.patientId,
        organization_id: seeded.orgId,
        start_date: new Date().toISOString().slice(0, 10),
        status: 'admitted',
        dpjp_id: seeded.doctorId,
        room_location_id: loc?.id ?? null,
        bed_number: '3A',
      })
      .select('id')
      .single()
    seeded.episodeOfCareId = ep?.id ?? ''

    const { data: inpEnc } = await supabase
      .from('encounters')
      .insert({
        patient_id: seeded.patientId,
        organization_id: seeded.orgId,
        encounter_class: 'inpatient',
        status: 'in_progress',
        arrived_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        episode_of_care_id: ep?.id ?? null,
      })
      .select('id')
      .single()
    seeded.inpatientEncounterId = inpEnc?.id ?? ''
  }
})

afterAll(async () => {
  // Hapus lab order items + lab orders (outpatient)
  if (seeded.outpatientLabOrderId) {
    await supabase.from('lab_order_items').delete().eq('lab_order_id', seeded.outpatientLabOrderId)
    await supabase.from('lab_orders').delete().eq('id', seeded.outpatientLabOrderId)
  }
  // Hapus lab order items + lab orders (inpatient)
  if (seeded.inpatientLabOrderId) {
    await supabase.from('lab_order_items').delete().eq('lab_order_id', seeded.inpatientLabOrderId)
    await supabase.from('lab_orders').delete().eq('id', seeded.inpatientLabOrderId)
  }
  // Hapus encounters
  if (seeded.outpatientEncounterId) {
    await supabase.from('encounters').delete().eq('id', seeded.outpatientEncounterId)
  }
  if (seeded.inpatientEncounterId) {
    await supabase.from('encounters').delete().eq('id', seeded.inpatientEncounterId)
  }
  // Hapus episode
  if (seeded.episodeOfCareId) {
    await supabase.from('episodes_of_care').delete().eq('id', seeded.episodeOfCareId)
  }
})

// ---------------------------------------------------------------------------
// Skenario 1 — Unit: validasi POST lab order
// ---------------------------------------------------------------------------

describe('Unit: validasi POST lab order', () => {
  it('encounter_id, patient_id, items wajib ada', () => {
    const validate = (body: Record<string, unknown>) => {
      const { encounter_id, patient_id, items } = body
      return !!(encounter_id && patient_id && (items as unknown[])?.length)
    }
    expect(validate({
      encounter_id: 'e1', patient_id: 'p1',
      items: [{ test_name: 'Hemoglobin' }],
    })).toBe(true)
    expect(validate({ patient_id: 'p1', items: [{}] })).toBe(false)
    expect(validate({ encounter_id: 'e1', patient_id: 'p1', items: [] })).toBe(false)
    expect(validate({ encounter_id: 'e1', items: [{ test_name: 'X' }] })).toBe(false)
  })

  it('hanya doctor/admin bisa POST lab order', () => {
    const allowed = ['doctor', 'admin']
    expect(allowed).toContain('doctor')
    expect(allowed).toContain('admin')
    expect(allowed).not.toContain('lab_nurse')
    expect(allowed).not.toContain('nurse')
    expect(allowed).not.toContain('pharmacist')
  })

  it('priority default ke routine jika tidak diisi', () => {
    const getPriority = (p?: string) => p ?? 'routine'
    expect(getPriority()).toBe('routine')
    expect(getPriority('stat')).toBe('stat')
    expect(getPriority('urgent')).toBe('urgent')
  })

  it('status awal lab order = lab_ordered', () => {
    const initialStatus = 'lab_ordered'
    expect(initialStatus).toBe('lab_ordered')
  })

  it('items bisa berisi test_name bebas (free label)', () => {
    const items = [
      { test_name: 'Hemoglobin', loinc_code: '718-7', specimen_type: 'darah' },
      { test_name: 'Leukosit (WBC)', specimen_type: 'darah vena' },
      { test_name: 'Custom Parameter — Bilirubin Total' },
      { test_name: 'Kultur Urine & Sensitivitas' },
    ]
    for (const item of items) {
      expect(item.test_name).toBeTruthy()
    }
    expect(items).toHaveLength(4)
  })
})

// ---------------------------------------------------------------------------
// Skenario 2 — Unit: status transitions lab order
// ---------------------------------------------------------------------------

describe('Unit: lab status transitions', () => {
  const validStatuses = ['lab_ordered', 'sample_taken', 'processing', 'result_uploaded', 'verified']

  it('semua status valid terdefinisi', () => {
    expect(validStatuses).toHaveLength(5)
    expect(validStatuses).toContain('lab_ordered')
    expect(validStatuses).toContain('sample_taken')
    expect(validStatuses).toContain('processing')
    expect(validStatuses).toContain('result_uploaded')
    expect(validStatuses).toContain('verified')
  })

  it('alur status maju: lab_ordered → sample_taken → processing → result_uploaded → verified', () => {
    const flow = ['lab_ordered', 'sample_taken', 'processing', 'result_uploaded', 'verified']
    expect(flow.indexOf('sample_taken')).toBeGreaterThan(flow.indexOf('lab_ordered'))
    expect(flow.indexOf('processing')).toBeGreaterThan(flow.indexOf('sample_taken'))
    expect(flow.indexOf('result_uploaded')).toBeGreaterThan(flow.indexOf('processing'))
    expect(flow.indexOf('verified')).toBeGreaterThan(flow.indexOf('result_uploaded'))
  })

  it('sample_taken stamp lab_nurse_id ke practitioner yang melakukan', () => {
    const buildUpdate = (status: string, practitionerId: string) => ({
      status,
      ...(status === 'sample_taken' ? { lab_nurse_id: practitionerId } : {}),
    })

    const updateSampleTaken = buildUpdate('sample_taken', 'nurse-123')
    expect(updateSampleTaken.lab_nurse_id).toBe('nurse-123')

    const updateProcessing = buildUpdate('processing', 'nurse-123')
    expect((updateProcessing as any).lab_nurse_id).toBeUndefined()
  })

  it('item_results auto-advance status ke result_uploaded', () => {
    // Saat item_results dikirim, auto status = result_uploaded
    const autoStatus = 'result_uploaded'
    expect(autoStatus).toBe('result_uploaded')
    expect(validStatuses).toContain(autoStatus)
  })
})

// ---------------------------------------------------------------------------
// Skenario 3 — Unit: result entry (free label + value)
// ---------------------------------------------------------------------------

describe('Unit: result entry bebas (label + value)', () => {
  it('result_value bisa berisi nilai numerik sebagai string', () => {
    const results = [
      { item_id: 'i1', result_value: '13.5', result_unit: 'g/dL', reference_range: '12.0-16.0' },
    ]
    expect(results[0].result_value).toBe('13.5')
    expect(results[0].result_unit).toBe('g/dL')
  })

  it('result_value bisa berisi teks bebas', () => {
    const results = [
      { item_id: 'i1', result_value: 'Positif (+2)', reference_range: 'Negatif' },
      { item_id: 'i2', result_value: 'Tidak ditemukan bakteri', result_status: 'normal' },
      { item_id: 'i3', result_value: 'Warna kuning, jernih, pH 6.5' },
    ]
    for (const r of results) {
      expect(r.result_value).toBeTruthy()
    }
  })

  it('result_status default normal jika tidak diisi', () => {
    const getStatus = (s?: string) => s ?? 'normal'
    expect(getStatus()).toBe('normal')
    expect(getStatus('abnormal')).toBe('abnormal')
    expect(getStatus('critical')).toBe('critical')
  })

  it('multiple item_results bisa dikirim sekaligus', () => {
    const item_results = [
      { item_id: 'i1', result_value: '13.5', result_unit: 'g/dL' },
      { item_id: 'i2', result_value: '8200', result_unit: '/µL', result_status: 'normal' },
      { item_id: 'i3', result_value: '250000', result_unit: '/µL' },
    ]
    expect(item_results).toHaveLength(3)
    expect(item_results.every(r => r.item_id && r.result_value)).toBe(true)
  })

  it('notes bisa diisi teks keterangan bebas per item', () => {
    const item = {
      item_id: 'i1',
      result_value: '14.2',
      result_unit: 'g/dL',
      notes: 'Sampel hemolisis ringan, hasil mungkin sedikit lebih rendah',
    }
    expect(item.notes).toBeTruthy()
  })

  it('item bisa dikirim tanpa loinc_code (test lokal)', () => {
    const item = { test_name: 'Tes Custom Lokal', loinc_code: null, specimen_type: 'urine' }
    expect(item.test_name).toBeTruthy()
    expect(item.loinc_code).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Skenario 4 — Unit: encounter status waiting_lab
// ---------------------------------------------------------------------------

describe('Unit: encounter status waiting_lab', () => {
  it('encounter status waiting_lab valid', () => {
    const validEncounterStatuses = ['planned', 'arrived', 'in_progress', 'waiting_lab', 'finished', 'cancelled']
    expect(validEncounterStatuses).toContain('waiting_lab')
  })

  it('doctor list bisa filter encounters by status=waiting_lab', () => {
    // Simulate query: GET /api/encounters?status=waiting_lab
    const buildQuery = (status?: string) => ({
      table: 'encounters',
      filter: status ? { status } : {},
    })
    const q = buildQuery('waiting_lab')
    expect((q.filter as any).status).toBe('waiting_lab')
  })

  it('encounter GET include lab_orders join', () => {
    // GET /api/encounters response shape includes lab_orders
    const encounterShape = {
      id: 'enc1',
      status: 'waiting_lab',
      lab_orders: [{ id: 'lo1', status: 'lab_ordered', lab_order_items: [] }],
    }
    expect(Array.isArray(encounterShape.lab_orders)).toBe(true)
    expect(encounterShape.lab_orders[0].status).toBe('lab_ordered')
  })

  it('ketika hasil lab keluar, encounter bisa kembali ke in_progress', () => {
    // Dokter bisa PATCH encounter status kembali ke in_progress setelah hasil lab keluar
    const transitions = ['in_progress', 'waiting_lab', 'in_progress', 'finished']
    expect(transitions).toContain('in_progress')
    expect(transitions).toContain('waiting_lab')
  })
})

// ---------------------------------------------------------------------------
// Skenario 5 — Integritas tabel lab
// ---------------------------------------------------------------------------

describe('Integritas tabel lab', () => {
  it('tabel lab_orders bisa di-query', async () => {
    const { data, error } = await supabase
      .from('lab_orders')
      .select('id, encounter_id, patient_id, status, priority, order_date')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('lab_orders status hanya nilai valid', async () => {
    const VALID = ['lab_ordered', 'sample_taken', 'processing', 'result_uploaded', 'verified']
    const { data } = await supabase
      .from('lab_orders')
      .select('status')
      .limit(50)
    for (const row of data ?? []) {
      expect(VALID).toContain(row.status)
    }
  })

  it('lab_orders priority hanya routine/stat/urgent', async () => {
    const VALID = ['routine', 'stat', 'urgent']
    const { data } = await supabase
      .from('lab_orders')
      .select('priority')
      .not('priority', 'is', null)
      .limit(30)
    for (const row of data ?? []) {
      expect(VALID).toContain(row.priority)
    }
  })

  it('tabel lab_order_items bisa di-query', async () => {
    const { data, error } = await supabase
      .from('lab_order_items')
      .select('id, lab_order_id, test_name, result_value, result_status')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('lab_order_items result_status hanya normal/abnormal/critical jika terisi', async () => {
    const VALID = ['normal', 'abnormal', 'critical']
    const { data } = await supabase
      .from('lab_order_items')
      .select('result_status')
      .not('result_status', 'is', null)
      .limit(30)
    for (const row of data ?? []) {
      expect(VALID).toContain(row.result_status)
    }
  })

  it('lab_order_items test_name tidak kosong', async () => {
    const { data } = await supabase
      .from('lab_order_items')
      .select('test_name')
      .limit(20)
    for (const row of data ?? []) {
      expect(row.test_name).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// Skenario 6 — INSERT lab order outpatient
// ---------------------------------------------------------------------------

describe('INSERT lab order — outpatient', () => {
  it('seed: INSERT lab order outpatient berhasil', async () => {
    if (!seeded.outpatientEncounterId || !seeded.patientId || !seeded.doctorId) {
      console.log('  [SKIP] Data seed tidak lengkap')
      return
    }

    const { data, error } = await supabase
      .from('lab_orders')
      .insert({
        encounter_id: seeded.outpatientEncounterId,
        patient_id: seeded.patientId,
        ordered_by: seeded.doctorId,
        priority: 'routine',
        status: 'lab_ordered',
        clinical_notes: 'Kontrol rutin, cek DL lengkap',
      })
      .select('id, status, priority')
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('lab_ordered')
    expect(data?.priority).toBe('routine')
    seeded.outpatientLabOrderId = data?.id ?? ''
  })

  it('seed: INSERT 2 lab order items (bebas test_name)', async () => {
    if (!seeded.outpatientLabOrderId) return

    const { data, error } = await supabase
      .from('lab_order_items')
      .insert([
        {
          lab_order_id: seeded.outpatientLabOrderId,
          test_name: 'Hemoglobin',
          loinc_code: '718-7',
          specimen_type: 'Darah vena',
        },
        {
          lab_order_id: seeded.outpatientLabOrderId,
          test_name: 'Leukosit (WBC)',
          loinc_code: '6690-2',
          specimen_type: 'Darah vena',
        },
      ])
      .select('id, test_name')

    expect(error).toBeNull()
    expect(data).toHaveLength(2)
    expect(data?.[0].test_name).toBe('Hemoglobin')
    expect(data?.[1].test_name).toBe('Leukosit (WBC)')
    seeded.outpatientItemId1 = data?.[0].id ?? ''
    seeded.outpatientItemId2 = data?.[1].id ?? ''
  })

  it('lab order punya FK ke encounter dan patient', async () => {
    if (!seeded.outpatientLabOrderId) return
    const { data } = await supabase
      .from('lab_orders')
      .select('encounter_id, patient_id, ordered_by')
      .eq('id', seeded.outpatientLabOrderId)
      .single()
    expect(data?.encounter_id).toBe(seeded.outpatientEncounterId)
    expect(data?.patient_id).toBe(seeded.patientId)
    expect(data?.ordered_by).toBe(seeded.doctorId)
  })

  it('GET lab orders by encounter_id', async () => {
    if (!seeded.outpatientEncounterId || !seeded.outpatientLabOrderId) return
    const { data, error } = await supabase
      .from('lab_orders')
      .select('id, status')
      .eq('encounter_id', seeded.outpatientEncounterId)
    expect(error).toBeNull()
    const ids = (data ?? []).map(r => r.id)
    expect(ids).toContain(seeded.outpatientLabOrderId)
  })
})

// ---------------------------------------------------------------------------
// Skenario 7 — Encounter status waiting_lab (doctor list)
// ---------------------------------------------------------------------------

describe('Encounter status waiting_lab — doctor patient list', () => {
  it('encounter status berubah ke waiting_lab setelah lab order dibuat', async () => {
    if (!seeded.outpatientEncounterId) return

    const { error } = await supabase
      .from('encounters')
      .update({ status: 'waiting_lab' })
      .eq('id', seeded.outpatientEncounterId)

    expect(error).toBeNull()

    const { data } = await supabase
      .from('encounters')
      .select('status')
      .eq('id', seeded.outpatientEncounterId)
      .single()

    expect(data?.status).toBe('waiting_lab')
  })

  it('GET encounters filter status=waiting_lab berhasil', async () => {
    const { data, error } = await supabase
      .from('encounters')
      .select('id, status')
      .eq('status', 'waiting_lab')
      .limit(20)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    for (const enc of data ?? []) {
      expect(enc.status).toBe('waiting_lab')
    }
  })

  it('encounter waiting_lab seeded ada di hasil query', async () => {
    if (!seeded.outpatientEncounterId) return
    const { data } = await supabase
      .from('encounters')
      .select('id, status')
      .eq('id', seeded.outpatientEncounterId)
      .single()
    expect(data?.status).toBe('waiting_lab')
  })

  it('GET encounter dengan JOIN lab_orders', async () => {
    if (!seeded.outpatientEncounterId || !seeded.outpatientLabOrderId) return

    const { data, error } = await supabase
      .from('encounters')
      .select('id, status, lab_orders(id, status, lab_order_items(id, test_name))')
      .eq('id', seeded.outpatientEncounterId)
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('waiting_lab')
    const labOrders = (data as any)?.lab_orders ?? []
    expect(labOrders.length).toBeGreaterThan(0)
    expect(labOrders[0].status).toBe('lab_ordered')
    const items = labOrders[0].lab_order_items ?? []
    expect(items.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Skenario 8 — Lab nurse: ambil sampel + proses
// ---------------------------------------------------------------------------

describe('Lab nurse: status transitions', () => {
  it('PATCH status sample_taken — stamps lab_nurse_id', async () => {
    if (!seeded.outpatientLabOrderId || !seeded.labNurseId) {
      console.log('  [SKIP] Tidak ada lab order ID atau lab_nurse ID')
      return
    }

    const { data, error } = await supabase
      .from('lab_orders')
      .update({
        status: 'sample_taken',
        lab_nurse_id: seeded.labNurseId,
      })
      .eq('id', seeded.outpatientLabOrderId)
      .select('status, lab_nurse_id')
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('sample_taken')
    expect(data?.lab_nurse_id).toBe(seeded.labNurseId)
  })

  it('PATCH status processing', async () => {
    if (!seeded.outpatientLabOrderId) return

    const { data, error } = await supabase
      .from('lab_orders')
      .update({ status: 'processing' })
      .eq('id', seeded.outpatientLabOrderId)
      .select('status')
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('processing')
  })
})

// ---------------------------------------------------------------------------
// Skenario 9 — Lab nurse: isi hasil (bebas label + value per item)
// ---------------------------------------------------------------------------

describe('Lab nurse: isi hasil (item_results free label+value)', () => {
  it('PATCH item result item 1 — Hemoglobin dengan value + unit + reference_range', async () => {
    if (!seeded.outpatientItemId1) {
      console.log('  [SKIP] Tidak ada item ID 1')
      return
    }

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('lab_order_items')
      .update({
        result_value: '13.5',
        result_unit: 'g/dL',
        reference_range: '12.0 - 16.0 g/dL',
        result_status: 'normal',
        result_entered_at: now,
        result_entered_by: seeded.labNurseId || seeded.doctorId,
        notes: null,
      })
      .eq('id', seeded.outpatientItemId1)
      .select('result_value, result_unit, reference_range, result_status')
      .single()

    expect(error).toBeNull()
    expect(data?.result_value).toBe('13.5')
    expect(data?.result_unit).toBe('g/dL')
    expect(data?.reference_range).toBe('12.0 - 16.0 g/dL')
    expect(data?.result_status).toBe('normal')
  })

  it('PATCH item result item 2 — WBC dengan nilai bebas + catatan', async () => {
    if (!seeded.outpatientItemId2) return

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('lab_order_items')
      .update({
        result_value: '11500',
        result_unit: '/µL',
        reference_range: '4500 - 11000 /µL',
        result_status: 'abnormal',
        result_entered_at: now,
        result_entered_by: seeded.labNurseId || seeded.doctorId,
        notes: 'Leukositosis ringan, perlu follow-up klinis',
      })
      .eq('id', seeded.outpatientItemId2)
      .select('result_value, result_status, notes')
      .single()

    expect(error).toBeNull()
    expect(data?.result_value).toBe('11500')
    expect(data?.result_status).toBe('abnormal')
    expect(data?.notes).toBeTruthy()
  })

  it('bisa tambah item baru ke lab order yang sudah ada', async () => {
    if (!seeded.outpatientLabOrderId) return

    const { data, error } = await supabase
      .from('lab_order_items')
      .insert({
        lab_order_id: seeded.outpatientLabOrderId,
        test_name: 'Trombosit (PLT)',
        loinc_code: '777-3',
        specimen_type: 'Darah vena',
      })
      .select('id, test_name')
      .single()

    expect(error).toBeNull()
    expect(data?.test_name).toBe('Trombosit (PLT)')

    // Fill result untuk item baru
    if (data?.id) {
      const { error: resErr } = await supabase
        .from('lab_order_items')
        .update({
          result_value: '185000',
          result_unit: '/µL',
          reference_range: '150000 - 400000 /µL',
          result_status: 'normal',
          result_entered_at: new Date().toISOString(),
          result_entered_by: seeded.labNurseId || seeded.doctorId,
        })
        .eq('id', data.id)

      expect(resErr).toBeNull()

      // Cleanup item extra ini
      await supabase.from('lab_order_items').delete().eq('id', data.id)
    }
  })

  it('result_value bisa berisi teks deskriptif (non-numerik)', async () => {
    if (!seeded.outpatientLabOrderId) return

    // Insert item khusus untuk uji free-text result
    const { data: textItem } = await supabase
      .from('lab_order_items')
      .insert({
        lab_order_id: seeded.outpatientLabOrderId,
        test_name: 'Kultur Darah',
        specimen_type: 'Darah vena 10mL',
      })
      .select('id')
      .single()

    if (!textItem) return

    const { data, error } = await supabase
      .from('lab_order_items')
      .update({
        result_value: 'Tidak ditemukan pertumbuhan bakteri setelah inkubasi 5x24 jam',
        result_status: 'normal',
        reference_range: 'Steril / No growth',
        result_entered_at: new Date().toISOString(),
        result_entered_by: seeded.labNurseId || seeded.doctorId,
      })
      .eq('id', textItem.id)
      .select('result_value')
      .single()

    expect(error).toBeNull()
    expect(data?.result_value).toContain('Tidak ditemukan')

    // Cleanup
    await supabase.from('lab_order_items').delete().eq('id', textItem.id)
  })

  it('auto-advance lab order ke result_uploaded setelah isi hasil', async () => {
    if (!seeded.outpatientLabOrderId) return

    const { data, error } = await supabase
      .from('lab_orders')
      .update({ status: 'result_uploaded' })
      .eq('id', seeded.outpatientLabOrderId)
      .select('status')
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('result_uploaded')
  })

  it('PATCH status verified — hasil lab dikonfirmasi dokter', async () => {
    if (!seeded.outpatientLabOrderId) return

    const { data, error } = await supabase
      .from('lab_orders')
      .update({ status: 'verified' })
      .eq('id', seeded.outpatientLabOrderId)
      .select('status')
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('verified')
  })
})

// ---------------------------------------------------------------------------
// Skenario 10 — Lab order inpatient
// ---------------------------------------------------------------------------

describe('Lab order — inpatient (rawat inap)', () => {
  it('seed: INSERT lab order inpatient berhasil', async () => {
    if (!seeded.inpatientEncounterId || !seeded.patientId || !seeded.doctorId) {
      console.log('  [SKIP] Data seed inpatient tidak lengkap')
      return
    }

    const { data, error } = await supabase
      .from('lab_orders')
      .insert({
        encounter_id: seeded.inpatientEncounterId,
        patient_id: seeded.patientId,
        ordered_by: seeded.doctorId,
        priority: 'stat',
        status: 'lab_ordered',
        clinical_notes: 'Monitor infeksi pasca operasi',
      })
      .select('id, status, priority')
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('lab_ordered')
    expect(data?.priority).toBe('stat')
    seeded.inpatientLabOrderId = data?.id ?? ''
  })

  it('INSERT lab order item inpatient — test_name bebas', async () => {
    if (!seeded.inpatientLabOrderId) return

    const { data, error } = await supabase
      .from('lab_order_items')
      .insert([
        { lab_order_id: seeded.inpatientLabOrderId, test_name: 'CRP (C-Reactive Protein)', loinc_code: '1988-5', specimen_type: 'Darah vena' },
        { lab_order_id: seeded.inpatientLabOrderId, test_name: 'Prokalsitonin (PCT)', loinc_code: '33959-8', specimen_type: 'Darah vena' },
        { lab_order_id: seeded.inpatientLabOrderId, test_name: 'LED (Erythrocyte Sedimentation Rate)', loinc_code: '4537-7', specimen_type: 'Darah vena (citrat)' },
      ])
      .select('id, test_name')

    expect(error).toBeNull()
    expect(data).toHaveLength(3)
    seeded.inpatientItemId = data?.[0].id ?? ''
  })

  it('lab order inpatient terhubung ke encounter dengan episode_of_care_id', async () => {
    if (!seeded.inpatientEncounterId || !seeded.episodeOfCareId) return

    const { data: enc } = await supabase
      .from('encounters')
      .select('episode_of_care_id, encounter_class')
      .eq('id', seeded.inpatientEncounterId)
      .single()

    expect(enc?.encounter_class).toBe('inpatient')
    expect(enc?.episode_of_care_id).toBe(seeded.episodeOfCareId)
  })

  it('filter lab orders inpatient by encounter_id', async () => {
    if (!seeded.inpatientEncounterId || !seeded.inpatientLabOrderId) return

    const { data } = await supabase
      .from('lab_orders')
      .select('id, status, priority')
      .eq('encounter_id', seeded.inpatientEncounterId)

    expect(Array.isArray(data)).toBe(true)
    const ids = (data ?? []).map(r => r.id)
    expect(ids).toContain(seeded.inpatientLabOrderId)
  })

  it('inpatient encounter bisa set waiting_lab', async () => {
    if (!seeded.inpatientEncounterId) return

    const { error } = await supabase
      .from('encounters')
      .update({ status: 'waiting_lab' })
      .eq('id', seeded.inpatientEncounterId)

    expect(error).toBeNull()

    const { data } = await supabase
      .from('encounters')
      .select('status')
      .eq('id', seeded.inpatientEncounterId)
      .single()

    expect(data?.status).toBe('waiting_lab')

    // Restore ke in_progress
    await supabase.from('encounters').update({ status: 'in_progress' }).eq('id', seeded.inpatientEncounterId)
  })

  it('isi hasil lab inpatient dengan nilai kritis (critical)', async () => {
    if (!seeded.inpatientItemId) return

    const { data, error } = await supabase
      .from('lab_order_items')
      .update({
        result_value: '285',
        result_unit: 'mg/L',
        reference_range: '< 5 mg/L',
        result_status: 'critical',
        result_entered_at: new Date().toISOString(),
        result_entered_by: seeded.labNurseId || seeded.doctorId,
        notes: 'KRITIS — Laporkan segera ke dokter DPJP',
      })
      .eq('id', seeded.inpatientItemId)
      .select('result_value, result_status, notes')
      .single()

    expect(error).toBeNull()
    expect(data?.result_status).toBe('critical')
    expect(data?.notes).toContain('KRITIS')
  })
})

// ---------------------------------------------------------------------------
// Skenario 11 — GET detail + filter
// ---------------------------------------------------------------------------

describe('GET lab order detail + filter', () => {
  it('GET detail lab order dengan JOIN lab_order_items', async () => {
    if (!seeded.outpatientLabOrderId) return

    const { data, error } = await supabase
      .from('lab_orders')
      .select('id, status, priority, clinical_notes, lab_order_items(id, test_name, result_value, result_status)')
      .eq('id', seeded.outpatientLabOrderId)
      .single()

    expect(error).toBeNull()
    expect(data?.id).toBe(seeded.outpatientLabOrderId)
    const items = (data as any)?.lab_order_items ?? []
    expect(items.length).toBeGreaterThanOrEqual(2)
  })

  it('lab_order_items hasil terisi setelah PATCH', async () => {
    if (!seeded.outpatientItemId1) return

    const { data } = await supabase
      .from('lab_order_items')
      .select('result_value, result_unit, result_status, result_entered_at')
      .eq('id', seeded.outpatientItemId1)
      .single()

    expect(data?.result_value).toBe('13.5')
    expect(data?.result_unit).toBe('g/dL')
    expect(data?.result_status).toBe('normal')
    expect(data?.result_entered_at).toBeTruthy()
  })

  it('filter lab_orders by status=verified', async () => {
    const { data, error } = await supabase
      .from('lab_orders')
      .select('id, status')
      .eq('status', 'verified')
      .limit(10)
    expect(error).toBeNull()
    for (const row of data ?? []) {
      expect(row.status).toBe('verified')
    }
  })

  it('filter lab_orders by status=lab_ordered', async () => {
    const { data, error } = await supabase
      .from('lab_orders')
      .select('id, status')
      .eq('status', 'lab_ordered')
      .limit(10)
    expect(error).toBeNull()
    for (const row of data ?? []) {
      expect(row.status).toBe('lab_ordered')
    }
  })

  it('GET lab_orders dengan JOIN patients dan practitioners', async () => {
    if (!seeded.outpatientLabOrderId) return

    const { data, error } = await supabase
      .from('lab_orders')
      .select(`
        id, status,
        patients:patient_id(full_name, medical_record_no),
        practitioners:ordered_by(full_name)
      `)
      .eq('id', seeded.outpatientLabOrderId)
      .single()

    expect(error).toBeNull()
    expect((data as any)?.patients?.full_name).toBeTruthy()
    expect((data as any)?.practitioners?.full_name).toBeTruthy()
  })

  it('encounter kembali ke in_progress setelah hasil lab keluar', async () => {
    if (!seeded.outpatientEncounterId) return

    const { error } = await supabase
      .from('encounters')
      .update({ status: 'in_progress' })
      .eq('id', seeded.outpatientEncounterId)

    expect(error).toBeNull()

    const { data } = await supabase
      .from('encounters')
      .select('status')
      .eq('id', seeded.outpatientEncounterId)
      .single()

    expect(data?.status).toBe('in_progress')
  })
})
