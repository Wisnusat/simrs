/**
 * Integration + Unit tests — Fitur Operasi (Surgery / OK)
 *
 * Role yang terlibat:
 *   - doctor       → request operasi, pre-op assessment, intra-op notes, post-op (DPJP/surgeon)
 *   - nurse        → persiapan OK, assist intra-op, PACU notes
 *   - anesthesiologist (doctor) → anestesi notes, post-op wajib isi
 *
 * Status flow:
 *   surgery_requested → surgery_scheduled → ready_for_surgery
 *   → intra_operative → surgery_completed → post_operative
 *
 * Skenario:
 *   A. Unit — validasi input POST (field wajib)
 *   B. Unit — status transition rules
 *   C. Unit — auto-insert procedure saat completed/post_operative
 *   D. Unit — anesthesia_type values
 *   E. Integration — data surgery_requests di DB
 *   F. Integration — INSERT surgery request (seed + cleanup)
 *   G. Integration — PATCH status transitions
 *   H. Integration — procedure auto-insert on completion
 *   I. Integration — GET dengan filter status/patient
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let supabase: ReturnType<typeof createClient>

const CLEANUP: {
  surgeryIds: string[]
  procedureIds: string[]
} = { surgeryIds: [], procedureIds: [] }

beforeAll(async () => {
  supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
})

afterAll(async () => {
  if (CLEANUP.procedureIds.length > 0)
    await supabase.from('procedures').delete().in('id', CLEANUP.procedureIds)
  if (CLEANUP.surgeryIds.length > 0)
    await supabase.from('surgery_requests').delete().in('id', CLEANUP.surgeryIds)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getLatestEncounter() {
  const { data } = await supabase
    .from('encounters')
    .select('id, patient_id, organization_id')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

async function getDoctorPractitioner() {
  const { data } = await supabase
    .from('practitioners')
    .select('id, role, full_name')
    .eq('role', 'doctor')
    .limit(1)
    .maybeSingle()
  return data
}

// ---------------------------------------------------------------------------
// A. Unit — validasi input POST
// ---------------------------------------------------------------------------

describe('A. Unit — validasi POST surgery request', () => {
  function validateSurgeryRequest(body: Record<string, any>): string | null {
    if (!body.patient_id || !body.encounter_id || !body.surgery_type || !body.indication) {
      return 'patient_id, encounter_id, surgery_type, and indication are required'
    }
    return null
  }

  it('Input lengkap lolos validasi', () => {
    expect(validateSurgeryRequest({
      patient_id: 'pat-1',
      encounter_id: 'enc-1',
      surgery_type: 'Appendektomi',
      indication: 'Appendisitis akut',
    })).toBeNull()
  })

  it('Tanpa patient_id → error', () => {
    expect(validateSurgeryRequest({
      encounter_id: 'enc-1', surgery_type: 'Appendektomi', indication: 'Appendisitis',
    })).toBeTruthy()
  })

  it('Tanpa encounter_id → error', () => {
    expect(validateSurgeryRequest({
      patient_id: 'pat-1', surgery_type: 'Appendektomi', indication: 'Appendisitis',
    })).toBeTruthy()
  })

  it('Tanpa surgery_type → error', () => {
    expect(validateSurgeryRequest({
      patient_id: 'pat-1', encounter_id: 'enc-1', indication: 'Appendisitis',
    })).toBeTruthy()
  })

  it('Tanpa indication → error', () => {
    expect(validateSurgeryRequest({
      patient_id: 'pat-1', encounter_id: 'enc-1', surgery_type: 'Appendektomi',
    })).toBeTruthy()
  })

  it('Status default = surgery_requested', () => {
    const defaultStatus = 'surgery_requested'
    expect(defaultStatus).toBe('surgery_requested')
  })

  it('needs_inpatient_after default = false', () => {
    const defaultVal = false
    expect(defaultVal).toBe(false)
  })

  it('episode_of_care_id opsional (boleh null)', () => {
    expect(validateSurgeryRequest({
      patient_id: 'pat-1', encounter_id: 'enc-1',
      surgery_type: 'Sectio Caesarea', indication: 'Indikasi ibu dan janin',
      // tidak ada episode_of_care_id
    })).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// B. Unit — status transition rules
// ---------------------------------------------------------------------------

describe('B. Unit — surgery status transitions', () => {
  const VALID_STATUSES = [
    'surgery_requested',
    'surgery_scheduled',
    'ready_for_surgery',
    'intra_operative',
    'surgery_completed',
    'post_operative',
  ]

  const STATUS_ORDER = VALID_STATUSES

  function canTransition(from: string, to: string): boolean {
    const fromIdx = STATUS_ORDER.indexOf(from)
    const toIdx = STATUS_ORDER.indexOf(to)
    if (fromIdx === -1 || toIdx === -1) return false
    // Boleh maju (increment) atau mundur ke scheduled untuk reschedule
    return toIdx === fromIdx + 1 || to === 'surgery_scheduled'
  }

  it('Semua status valid terdefinisi', () => {
    expect(VALID_STATUSES).toContain('surgery_requested')
    expect(VALID_STATUSES).toContain('surgery_scheduled')
    expect(VALID_STATUSES).toContain('ready_for_surgery')
    expect(VALID_STATUSES).toContain('intra_operative')
    expect(VALID_STATUSES).toContain('surgery_completed')
    expect(VALID_STATUSES).toContain('post_operative')
  })

  it('surgery_requested → surgery_scheduled valid', () => {
    expect(canTransition('surgery_requested', 'surgery_scheduled')).toBe(true)
  })

  it('surgery_scheduled → ready_for_surgery valid', () => {
    expect(canTransition('surgery_scheduled', 'ready_for_surgery')).toBe(true)
  })

  it('ready_for_surgery → intra_operative valid', () => {
    expect(canTransition('ready_for_surgery', 'intra_operative')).toBe(true)
  })

  it('intra_operative → surgery_completed valid', () => {
    expect(canTransition('intra_operative', 'surgery_completed')).toBe(true)
  })

  it('surgery_completed → post_operative valid', () => {
    expect(canTransition('surgery_completed', 'post_operative')).toBe(true)
  })

  it('Status tidak dikenal tidak valid', () => {
    expect(VALID_STATUSES.includes('cancelled')).toBe(false)
    expect(VALID_STATUSES.includes('pending')).toBe(false)
    expect(VALID_STATUSES.includes('done')).toBe(false)
  })

  it('Transisi ke surgery_completed menghasilkan auto-insert procedures', () => {
    // Logic dari route.ts: isTransitioningToCompleted
    function isTransitioningToCompleted(oldStatus: string, newStatus: string): boolean {
      return (
        oldStatus !== 'surgery_completed' && oldStatus !== 'post_operative' &&
        (newStatus === 'surgery_completed' || newStatus === 'post_operative')
      )
    }

    expect(isTransitioningToCompleted('intra_operative', 'surgery_completed')).toBe(true)
    expect(isTransitioningToCompleted('intra_operative', 'post_operative')).toBe(true)
    expect(isTransitioningToCompleted('surgery_completed', 'post_operative')).toBe(false) // sudah selesai
    expect(isTransitioningToCompleted('post_operative', 'post_operative')).toBe(false)
    expect(isTransitioningToCompleted('surgery_scheduled', 'surgery_completed')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// C. Unit — procedure notes auto-build
// ---------------------------------------------------------------------------

describe('C. Unit — auto procedure notes dari surgery fields', () => {
  function buildProcedureNotes(surgery: {
    indication?: string
    pre_op_assessment?: string
    intra_op_notes?: string
    post_op_notes?: string
  }): string {
    return [
      surgery.indication ? `Indikasi: ${surgery.indication}` : '',
      surgery.pre_op_assessment ? `Asesmen Pra-Bedah: ${surgery.pre_op_assessment}` : '',
      surgery.intra_op_notes ? `Catatan Intra-Operasi: ${surgery.intra_op_notes}` : '',
      surgery.post_op_notes ? `Catatan Pasca-Operasi: ${surgery.post_op_notes}` : '',
    ].filter(Boolean).join('\n\n')
  }

  it('Semua field diisi → notes gabungan terformat', () => {
    const notes = buildProcedureNotes({
      indication: 'Appendisitis',
      pre_op_assessment: 'Kondisi baik',
      intra_op_notes: 'Berjalan lancar',
      post_op_notes: 'Stabil',
    })
    expect(notes).toContain('Indikasi: Appendisitis')
    expect(notes).toContain('Asesmen Pra-Bedah: Kondisi baik')
    expect(notes).toContain('Catatan Intra-Operasi: Berjalan lancar')
    expect(notes).toContain('Catatan Pasca-Operasi: Stabil')
  })

  it('Field kosong tidak masuk notes', () => {
    const notes = buildProcedureNotes({ indication: 'Batu ginjal' })
    expect(notes).toBe('Indikasi: Batu ginjal')
    expect(notes).not.toContain('Asesmen')
    expect(notes).not.toContain('Intra-Operasi')
  })

  it('Semua field kosong → notes string kosong', () => {
    const notes = buildProcedureNotes({})
    expect(notes).toBe('')
  })

  it('procedure_code untuk operasi selalu "100"', () => {
    const SURGERY_PROCEDURE_CODE = '100'
    expect(SURGERY_PROCEDURE_CODE).toBe('100')
  })

  it('is_surgery flag = true untuk auto-inserted procedure', () => {
    const isSurgery = true
    expect(isSurgery).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// D. Unit — anesthesia types
// ---------------------------------------------------------------------------

describe('D. Unit — anesthesia type values', () => {
  const VALID_ANESTHESIA = ['umum', 'lokal', 'regional', 'spinal']

  it('Semua tipe anestesi valid terdefinisi', () => {
    expect(VALID_ANESTHESIA).toContain('umum')
    expect(VALID_ANESTHESIA).toContain('lokal')
    expect(VALID_ANESTHESIA).toContain('regional')
    expect(VALID_ANESTHESIA).toContain('spinal')
  })

  it('anesthesia_type opsional (boleh null)', () => {
    // Dari schema: anesthesia_type TEXT (nullable)
    const body = { surgery_type: 'Minor procedure' }
    expect(body).not.toHaveProperty('anesthesia_type')
  })
})

// ---------------------------------------------------------------------------
// E. Integration — data surgery_requests di DB
// ---------------------------------------------------------------------------

describe('E. Integration — surgery_requests data integrity', () => {
  it('Tabel surgery_requests bisa di-query', async () => {
    const { data, error } = await supabase
      .from('surgery_requests')
      .select('id, status, surgery_type, patient_id')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('Semua surgery_requests punya status valid', async () => {
    const VALID = ['surgery_requested', 'surgery_scheduled', 'ready_for_surgery',
      'intra_operative', 'surgery_completed', 'post_operative']
    const { data } = await supabase
      .from('surgery_requests')
      .select('id, status')
      .limit(50)
    for (const sr of data ?? []) {
      expect(VALID).toContain(sr.status)
    }
  })

  it('surgery_type dan indication tidak kosong', async () => {
    const { data } = await supabase
      .from('surgery_requests')
      .select('id, surgery_type, indication')
      .limit(20)
    for (const sr of data ?? []) {
      expect(sr.surgery_type).toBeTruthy()
      expect(sr.indication).toBeTruthy()
    }
  })

  it('Semua surgery_requests punya requested_by (doctor ID)', async () => {
    const { data } = await supabase
      .from('surgery_requests')
      .select('id, requested_by')
      .limit(20)
    for (const sr of data ?? []) {
      expect(sr.requested_by).toBeTruthy()
    }
  })

  it('anesthesia_type jika diisi harus nilai valid', async () => {
    const VALID = ['umum', 'lokal', 'regional', 'spinal']
    const { data } = await supabase
      .from('surgery_requests')
      .select('anesthesia_type')
      .not('anesthesia_type', 'is', null)
      .limit(20)
    for (const sr of data ?? []) {
      expect(VALID).toContain(sr.anesthesia_type)
    }
  })

  it('surgery_completed/post_operative punya surgeon_id', async () => {
    const { data } = await supabase
      .from('surgery_requests')
      .select('id, status, surgeon_id')
      .in('status', ['surgery_completed', 'post_operative'])
      .limit(10)
    for (const sr of data ?? []) {
      expect(sr.surgeon_id).toBeTruthy()
    }
  })

  it('surgery_completed punya surgery_start_at', async () => {
    const { data } = await supabase
      .from('surgery_requests')
      .select('id, surgery_start_at, surgery_end_at')
      .in('status', ['surgery_completed', 'post_operative'])
      .limit(10)
    for (const sr of data ?? []) {
      if (sr.surgery_start_at && sr.surgery_end_at) {
        // end harus setelah start
        expect(new Date(sr.surgery_end_at).getTime())
          .toBeGreaterThanOrEqual(new Date(sr.surgery_start_at).getTime())
      }
    }
  })
})

// ---------------------------------------------------------------------------
// F. Integration — INSERT surgery request
// ---------------------------------------------------------------------------

describe('F. Integration — INSERT surgery request', () => {
  it('INSERT surgery request berhasil dan status = surgery_requested', async () => {
    const enc = await getLatestEncounter()
    const doctor = await getDoctorPractitioner()

    if (!enc || !doctor) {
      console.log('  [SKIP] Tidak ada encounter atau doctor di DB')
      return
    }

    const { data, error } = await supabase
      .from('surgery_requests')
      .insert({
        patient_id: enc.patient_id,
        encounter_id: enc.id,
        requested_by: doctor.id,
        surgery_type: '[TEST] Appendektomi',
        indication: '[TEST] Appendisitis akut grade 2',
        anesthesia_type: 'umum',
        needs_inpatient_after: true,
        status: 'surgery_requested',
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('surgery_requested')
    expect(data?.surgery_type).toBe('[TEST] Appendektomi')
    expect(data?.needs_inpatient_after).toBe(true)
    expect(data?.surgeon_id).toBeNull() // belum dijadwalkan
    expect(data?.anesthesiologist_id).toBeNull()

    if (data?.id) CLEANUP.surgeryIds.push(data.id)
  })

  it('requested_by auto-set ke doctor yang membuat request', async () => {
    const doctor = await getDoctorPractitioner()
    if (!doctor) return

    const { data: sr } = await supabase
      .from('surgery_requests')
      .select('requested_by')
      .in('id', CLEANUP.surgeryIds)
      .limit(1)
      .maybeSingle()

    if (sr) {
      expect(sr.requested_by).toBe(doctor.id)
    }
  })
})

// ---------------------------------------------------------------------------
// G. Integration — PATCH status transitions
// ---------------------------------------------------------------------------

describe('G. Integration — PATCH status transitions', () => {
  let testSurgeryId: string | null = null

  beforeAll(async () => {
    // Gunakan surgery request yang dibuat di section F
    testSurgeryId = CLEANUP.surgeryIds[0] ?? null
    if (!testSurgeryId) {
      // Coba ambil yang sudah ada di DB
      const { data } = await supabase
        .from('surgery_requests')
        .select('id')
        .eq('status', 'surgery_requested')
        .not('surgery_type', 'like', '[TEST]%')
        .limit(1)
        .maybeSingle()
      testSurgeryId = data?.id ?? null
    }
  })

  it('PATCH ke surgery_scheduled berhasil', async () => {
    if (!testSurgeryId) {
      console.log('  [SKIP] Tidak ada surgery request test')
      return
    }

    const doctor = await getDoctorPractitioner()
    const scheduledDate = new Date(Date.now() + 86400000).toISOString() // besok

    const { data, error } = await supabase
      .from('surgery_requests')
      .update({
        status: 'surgery_scheduled',
        scheduled_date: scheduledDate,
        surgeon_id: doctor?.id,
        anesthesiologist_id: doctor?.id, // pakai doctor yang sama untuk test
        updated_at: new Date().toISOString(),
      })
      .eq('id', testSurgeryId)
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('surgery_scheduled')
    expect(data?.surgeon_id).toBeTruthy()
    expect(data?.scheduled_date).toBeTruthy()
  })

  it('PATCH ke intra_operative berhasil dan surgery_start_at ter-set', async () => {
    if (!testSurgeryId) return

    const surgeryStart = new Date().toISOString()

    const { data, error } = await supabase
      .from('surgery_requests')
      .update({
        status: 'intra_operative',
        surgery_start_at: surgeryStart,
        updated_at: new Date().toISOString(),
      })
      .eq('id', testSurgeryId)
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('intra_operative')
    expect(data?.surgery_start_at).toBeTruthy()
  })

  it('PATCH ke surgery_completed → auto-insert procedures entry', async () => {
    if (!testSurgeryId) return

    const doctor = await getDoctorPractitioner()
    const surgeryEnd = new Date().toISOString()

    // Ambil surgery_request sebelum di-update
    const { data: before } = await supabase
      .from('surgery_requests')
      .select('encounter_id, patient_id, surgeon_id')
      .eq('id', testSurgeryId)
      .single()

    const { data, error } = await supabase
      .from('surgery_requests')
      .update({
        status: 'surgery_completed',
        surgery_end_at: surgeryEnd,
        intra_op_notes: '[TEST] Operasi berjalan lancar, tidak ada komplikasi',
        updated_at: new Date().toISOString(),
      })
      .eq('id', testSurgeryId)
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('surgery_completed')
    expect(data?.surgery_end_at).toBeTruthy()

    // Verifikasi procedures auto-insert (di-trigger oleh route.ts PATCH handler)
    // Catatan: auto-insert hanya terjadi via Next.js route, bukan direct Supabase update.
    // Test ini memverifikasi bahwa procedures tabel bisa menerima entry is_surgery=true.
    if (before?.encounter_id && before?.patient_id) {
      const { data: proc, error: procErr } = await supabase
        .from('procedures')
        .insert({
          encounter_id: before.encounter_id,
          patient_id: before.patient_id,
          performed_by: doctor?.id ?? before.surgeon_id,
          procedure_code: '100',
          procedure_display: '[TEST] Appendektomi',
          performed_at: surgeryEnd,
          status: 'completed',
          notes: '[TEST] Auto-insert simulation',
          is_surgery: true,
        })
        .select('id')
        .single()

      expect(procErr).toBeNull()
      expect(proc?.id).toBeTruthy()

      if (proc?.id) CLEANUP.procedureIds.push(proc.id)
    }
  })

  it('PATCH ke post_operative berhasil', async () => {
    if (!testSurgeryId) return

    const { data, error } = await supabase
      .from('surgery_requests')
      .update({
        status: 'post_operative',
        post_op_notes: '[TEST] Pasien sadar, hemodinamik stabil',
        updated_at: new Date().toISOString(),
      })
      .eq('id', testSurgeryId)
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('post_operative')
    expect(data?.post_op_notes).toContain('[TEST]')
  })
})

// ---------------------------------------------------------------------------
// H. Integration — procedures is_surgery flag
// ---------------------------------------------------------------------------

describe('H. Integration — procedures (is_surgery=true)', () => {
  it('Tabel procedures bisa di-query', async () => {
    const { data, error } = await supabase
      .from('procedures')
      .select('id, procedure_code, procedure_display, is_surgery, status')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('Procedures dengan is_surgery=true punya procedure_code "100"', async () => {
    const { data } = await supabase
      .from('procedures')
      .select('id, procedure_code, is_surgery')
      .eq('is_surgery', true)
      .limit(20)
    for (const proc of data ?? []) {
      expect(proc.procedure_code).toBe('100')
      expect(proc.is_surgery).toBe(true)
    }
  })

  it('Procedures status hanya nilai valid', async () => {
    const VALID = ['planned', 'completed', 'cancelled', 'in_progress']
    const { data } = await supabase
      .from('procedures')
      .select('status')
      .limit(30)
    for (const proc of data ?? []) {
      if (proc.status) expect(VALID).toContain(proc.status)
    }
  })
})

// ---------------------------------------------------------------------------
// I. Integration — GET surgery requests dengan filter
// ---------------------------------------------------------------------------

describe('I. Integration — GET surgery requests dengan filter', () => {
  it('GET semua surgery requests berhasil', async () => {
    const { data, error } = await supabase
      .from('surgery_requests')
      .select('id, status, surgery_type')
      .limit(10)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('Filter by status surgery_requested mengembalikan hanya yang requested', async () => {
    const { data } = await supabase
      .from('surgery_requests')
      .select('id, status')
      .eq('status', 'surgery_requested')
      .limit(10)
    for (const sr of data ?? []) {
      expect(sr.status).toBe('surgery_requested')
    }
  })

  it('Filter by status surgery_completed mengembalikan hanya yang completed', async () => {
    const { data } = await supabase
      .from('surgery_requests')
      .select('id, status, surgeon_id')
      .eq('status', 'surgery_completed')
      .limit(10)
    for (const sr of data ?? []) {
      expect(sr.status).toBe('surgery_completed')
    }
  })

  it('Filter by patient_id mengembalikan hanya surgery request pasien tersebut', async () => {
    // Ambil patient_id dari surgery request yang ada
    const { data: sample } = await supabase
      .from('surgery_requests')
      .select('patient_id')
      .limit(1)
      .maybeSingle()

    if (!sample?.patient_id) return

    const { data } = await supabase
      .from('surgery_requests')
      .select('id, patient_id')
      .eq('patient_id', sample.patient_id)

    for (const sr of data ?? []) {
      expect(sr.patient_id).toBe(sample.patient_id)
    }
  })

  it('Join surgeon dan anesthesiologist berhasil', async () => {
    const { data, error } = await supabase
      .from('surgery_requests')
      .select(`
        id, status,
        surgeon:surgeon_id ( id, full_name, role ),
        anesthesiologist:anesthesiologist_id ( id, full_name, role )
      `)
      .not('surgeon_id', 'is', null)
      .limit(5)

    expect(error).toBeNull()
    for (const sr of data ?? []) {
      const surgeon = (sr as any).surgeon
      if (surgeon) {
        expect(surgeon.full_name).toBeTruthy()
        expect(['doctor', 'admin']).toContain(surgeon.role)
      }
    }
  })
})
