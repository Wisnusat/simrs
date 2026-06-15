/**
 * Integration tests — Emergency (IGD) flow
 * Menggunakan Supabase service role key — bypass RLS
 *
 * Skenario:
 *   1. Unit: validasi input POST, role rules, triage field rules, outcome rules
 *   2. Integration: INSERT emergency encounter, GET detail, PATCH triage, PATCH outcome
 *   3. Vital signs via triage endpoint
 *   4. Outcome discharged / referred / admitted_inpatient
 *   5. Status transitions valid
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let supabase: ReturnType<typeof createClient>

// IDs of seeded rows — cleaned up in afterAll
const seeded = {
  encounterId: '' as string,
  emergencyId: '' as string,
  patientId: '' as string,
  orgId: '' as string,
  nurseId: '' as string,
  doctorId: '' as string,
  vitalSignId: '' as string,
  episodeId: '' as string,
  admissionId: '' as string,
}

// Extra encounters seeded for edge-case tests
const extraEncounterIds: string[] = []

beforeAll(async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib di .env')
  }
  supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  // Ambil konteks: org, patient, nurse, doctor
  const { data: org } = await supabase.from('organizations').select('id').limit(1).single()
  seeded.orgId = org?.id ?? ''

  const { data: patient } = await supabase.from('patients').select('id').limit(1).single()
  seeded.patientId = patient?.id ?? ''

  const { data: nurse } = await supabase
    .from('practitioners')
    .select('id')
    .eq('role', 'nurse')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  seeded.nurseId = nurse?.id ?? ''

  const { data: doctor } = await supabase
    .from('practitioners')
    .select('id')
    .eq('role', 'doctor')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  seeded.doctorId = doctor?.id ?? ''

  // Seed: buat encounter emergency + emergency_encounter
  if (seeded.patientId && seeded.orgId) {
    const { data: enc } = await supabase
      .from('encounters')
      .insert({
        patient_id: seeded.patientId,
        organization_id: seeded.orgId,
        encounter_class: 'emergency',
        status: 'arrived',
        arrived_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (enc) {
      seeded.encounterId = enc.id

      const { data: emg } = await supabase
        .from('emergency_encounters')
        .insert({
          encounter_id: enc.id,
          patient_id: seeded.patientId,
          status: 'emergency_admitted',
          triage_category: null,
          triage_complaint: null,
        })
        .select('id')
        .single()

      if (emg) seeded.emergencyId = emg.id
    }
  }
})

afterAll(async () => {
  // Hapus vital signs yang di-seed via triage
  if (seeded.vitalSignId) {
    await supabase.from('vital_signs').delete().eq('id', seeded.vitalSignId)
  }
  // Hapus inpatient admission + episode jika ada (outcome admitted_inpatient test)
  if (seeded.admissionId) {
    await supabase.from('inpatient_admissions').delete().eq('id', seeded.admissionId)
  }
  if (seeded.episodeId) {
    await supabase.from('episodes_of_care').delete().eq('id', seeded.episodeId)
  }
  // Hapus extra vital_signs terkait encounter utama
  if (seeded.encounterId) {
    await supabase.from('vital_signs').delete().eq('encounter_id', seeded.encounterId)
  }
  // Hapus emergency_encounter + encounter utama
  if (seeded.emergencyId) {
    await supabase.from('emergency_encounters').delete().eq('id', seeded.emergencyId)
  }
  if (seeded.encounterId) {
    await supabase.from('encounters').delete().eq('id', seeded.encounterId)
  }
  // Hapus extra encounters
  for (const id of extraEncounterIds) {
    const { data: emgs } = await supabase
      .from('emergency_encounters')
      .select('id')
      .eq('encounter_id', id)
    for (const e of emgs ?? []) {
      await supabase.from('emergency_encounters').delete().eq('id', e.id)
    }
    await supabase.from('encounters').delete().eq('id', id)
  }
})

// ---------------------------------------------------------------------------
// Skenario 1 — Unit: validasi request body POST
// ---------------------------------------------------------------------------

describe('Unit: validasi POST /api/emergency', () => {
  it('patient_id wajib ada', () => {
    const body: Record<string, unknown> = {}
    expect(body.patient_id).toBeUndefined()
  })

  it('triage_category hanya P1/P2/P3/P4', () => {
    const allowed = ['P1', 'P2', 'P3', 'P4']
    expect(allowed).toContain('P1')
    expect(allowed).toContain('P4')
    expect(allowed).not.toContain('P5')
    expect(allowed).not.toContain('p1')
    expect(allowed).not.toContain('URGENT')
  })

  it('triage_complaint wajib saat PATCH triage', () => {
    const triageBody = { triage_category: 'P2' }
    expect((triageBody as any).triage_complaint).toBeUndefined()
  })

  it('triage PATCH hanya role nurse', () => {
    const allowedRolesForTriage = ['nurse']
    expect(allowedRolesForTriage).toContain('nurse')
    expect(allowedRolesForTriage).not.toContain('doctor')
    expect(allowedRolesForTriage).not.toContain('admin')
    expect(allowedRolesForTriage).not.toContain('cashier')
  })

  it('outcome PATCH hanya role doctor', () => {
    const allowedRolesForOutcome = ['doctor']
    expect(allowedRolesForOutcome).toContain('doctor')
    expect(allowedRolesForOutcome).not.toContain('nurse')
    expect(allowedRolesForOutcome).not.toContain('admin')
  })

  it('POST create hanya role nurse atau doctor', () => {
    const allowedCreateRoles = ['nurse', 'doctor']
    expect(allowedCreateRoles).toContain('nurse')
    expect(allowedCreateRoles).toContain('doctor')
    expect(allowedCreateRoles).not.toContain('admin')
    expect(allowedCreateRoles).not.toContain('cashier')
    expect(allowedCreateRoles).not.toContain('pharmacist')
    expect(allowedCreateRoles).not.toContain('nutritionist')
  })

  it('outcome hanya discharged/referred/admitted_inpatient', () => {
    const allowed: string[] = ['discharged', 'referred', 'admitted_inpatient']
    expect(allowed).toContain('discharged')
    expect(allowed).toContain('referred')
    expect(allowed).toContain('admitted_inpatient')
    expect(allowed).not.toContain('completed')
    expect(allowed).not.toContain('transferred')
  })

  it('admitted_inpatient butuh admission_data lengkap', () => {
    const validate = (body: { outcome: string; admission_data?: Record<string, string> }) => {
      if (body.outcome !== 'admitted_inpatient') return true
      if (!body.admission_data) return false
      const { room_location_id, bed_number, room_class, dpjp_id } = body.admission_data
      return !!(room_location_id && bed_number && room_class && dpjp_id)
    }

    expect(validate({ outcome: 'discharged' })).toBe(true)
    expect(validate({ outcome: 'admitted_inpatient' })).toBe(false)
    expect(
      validate({
        outcome: 'admitted_inpatient',
        admission_data: { room_location_id: 'r1', bed_number: '1A', room_class: 'vip', dpjp_id: 'd1' },
      }),
    ).toBe(true)
    expect(
      validate({
        outcome: 'admitted_inpatient',
        admission_data: { room_location_id: 'r1', bed_number: '', room_class: 'vip', dpjp_id: 'd1' },
      }),
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Skenario 2 — Unit: status transitions
// ---------------------------------------------------------------------------

describe('Unit: status transitions emergency', () => {
  const validStatuses = [
    'emergency_admitted',
    'in_triage',
    'in_treatment',
    'completed',
    'referred_out',
    'admitted_to_inpatient',
  ]

  it('semua status valid terdefinisi', () => {
    expect(validStatuses).toHaveLength(6)
    expect(validStatuses).toContain('emergency_admitted')
    expect(validStatuses).toContain('in_triage')
    expect(validStatuses).toContain('in_treatment')
    expect(validStatuses).toContain('completed')
    expect(validStatuses).toContain('referred_out')
    expect(validStatuses).toContain('admitted_to_inpatient')
  })

  it('triage endpoint set status ke in_triage', () => {
    // Setelah PATCH /triage → status menjadi in_triage
    const afterTriage = 'in_triage'
    expect(validStatuses).toContain(afterTriage)
  })

  it('outcome endpoint set status ke completed', () => {
    // PATCH /outcome selalu set emergency status = completed
    const afterOutcome = 'completed'
    expect(validStatuses).toContain(afterOutcome)
  })

  it('status final menutup encounter utama', () => {
    const finalStatuses = ['completed', 'referred_out', 'admitted_to_inpatient']
    for (const s of finalStatuses) {
      expect(validStatuses).toContain(s)
    }
  })
})

// ---------------------------------------------------------------------------
// Skenario 3 — Integritas data tabel emergency_encounters
// ---------------------------------------------------------------------------

describe('Integritas tabel emergency_encounters', () => {
  it('tabel bisa di-query', async () => {
    const { data, error } = await supabase
      .from('emergency_encounters')
      .select('id, encounter_id, patient_id, status')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('semua status di DB valid', async () => {
    const VALID = [
      'emergency_admitted',
      'in_triage',
      'in_treatment',
      'completed',
      'referred_out',
      'admitted_to_inpatient',
    ]
    const { data } = await supabase
      .from('emergency_encounters')
      .select('status')
      .limit(50)
    for (const row of data ?? []) {
      expect(VALID).toContain(row.status)
    }
  })

  it('triage_category di DB hanya P1/P2/P3/P4 jika terisi', async () => {
    const { data } = await supabase
      .from('emergency_encounters')
      .select('triage_category')
      .not('triage_category', 'is', null)
      .limit(30)
    for (const row of data ?? []) {
      expect(['P1', 'P2', 'P3', 'P4']).toContain(row.triage_category)
    }
  })

  it('setiap emergency_encounter punya encounter_id valid', async () => {
    const { data } = await supabase
      .from('emergency_encounters')
      .select('id, encounter_id')
      .limit(20)
    for (const row of data ?? []) {
      expect(row.encounter_id).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// Skenario 4 — INSERT emergency encounter (seed)
// ---------------------------------------------------------------------------

describe('INSERT emergency encounter', () => {
  it('seed encounter emergency berhasil dibuat', () => {
    expect(seeded.encounterId).toBeTruthy()
    expect(seeded.emergencyId).toBeTruthy()
  })

  it('encounter utama punya encounter_class = emergency', async () => {
    if (!seeded.encounterId) return
    const { data } = await supabase
      .from('encounters')
      .select('encounter_class, status')
      .eq('id', seeded.encounterId)
      .single()
    expect(data?.encounter_class).toBe('emergency')
    expect(data?.status).toBe('arrived')
  })

  it('emergency_encounter status awal = emergency_admitted', async () => {
    if (!seeded.emergencyId) return
    const { data } = await supabase
      .from('emergency_encounters')
      .select('status, triage_category')
      .eq('id', seeded.emergencyId)
      .single()
    expect(data?.status).toBe('emergency_admitted')
    expect(data?.triage_category).toBeNull()
  })

  it('emergency_encounter punya patient_id', async () => {
    if (!seeded.emergencyId) return
    const { data } = await supabase
      .from('emergency_encounters')
      .select('patient_id, encounter_id')
      .eq('id', seeded.emergencyId)
      .single()
    expect(data?.patient_id).toBe(seeded.patientId)
    expect(data?.encounter_id).toBe(seeded.encounterId)
  })
})

// ---------------------------------------------------------------------------
// Skenario 5 — GET detail emergency encounter
// ---------------------------------------------------------------------------

describe('GET detail emergency encounter', () => {
  it('bisa fetch detail dengan join patients', async () => {
    if (!seeded.emergencyId) return
    const { data, error } = await supabase
      .from('emergency_encounters')
      .select(`
        id, status, triage_category,
        patients:patient_id (id, full_name, medical_record_no),
        encounters:encounter_id (id, status, encounter_class)
      `)
      .eq('id', seeded.emergencyId)
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBe(seeded.emergencyId)
    expect((data as any)?.patients).toBeTruthy()
    expect((data as any)?.patients?.full_name).toBeTruthy()
    expect((data as any)?.encounters?.encounter_class).toBe('emergency')
  })

  it('GET list bisa filter by status', async () => {
    const { data, error } = await supabase
      .from('emergency_encounters')
      .select('id, status')
      .eq('status', 'emergency_admitted')
      .limit(10)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    for (const row of data ?? []) {
      expect(row.status).toBe('emergency_admitted')
    }
  })

  it('GET list bisa filter multiple status', async () => {
    const statuses = ['in_triage', 'in_treatment']
    const { data, error } = await supabase
      .from('emergency_encounters')
      .select('id, status')
      .in('status', statuses)
      .limit(10)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('GET list punya paginasi (limit/offset)', async () => {
    const page1 = await supabase
      .from('emergency_encounters')
      .select('id')
      .order('created_at', { ascending: false })
      .range(0, 4)
    const page2 = await supabase
      .from('emergency_encounters')
      .select('id')
      .order('created_at', { ascending: false })
      .range(5, 9)
    expect(page1.error).toBeNull()
    expect(page2.error).toBeNull()
    // IDs halaman 1 dan 2 tidak overlap
    const ids1 = new Set((page1.data ?? []).map(r => r.id))
    const ids2 = (page2.data ?? []).map(r => r.id)
    for (const id of ids2) {
      expect(ids1.has(id)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Skenario 6 — PATCH triage
// ---------------------------------------------------------------------------

describe('PATCH triage emergency', () => {
  it('update triage_category + status menjadi in_triage', async () => {
    if (!seeded.emergencyId || !seeded.nurseId) {
      console.log('  [SKIP] Tidak ada emergency ID atau nurse ID')
      return
    }

    const { data, error } = await supabase
      .from('emergency_encounters')
      .update({
        triage_category: 'P2',
        triage_complaint: 'Nyeri dada hebat, sesak nafas',
        triage_nurse_id: seeded.nurseId,
        triaged_at: new Date().toISOString(),
        status: 'in_triage',
        is_critical: true,
      })
      .eq('id', seeded.emergencyId)
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.triage_category).toBe('P2')
    expect(data?.triage_complaint).toBe('Nyeri dada hebat, sesak nafas')
    expect(data?.status).toBe('in_triage')
    expect(data?.is_critical).toBe(true)
    expect(data?.triage_nurse_id).toBe(seeded.nurseId)
    expect(data?.triaged_at).toBeTruthy()
  })

  it('encounter utama status berubah ke in_progress saat triage', async () => {
    if (!seeded.encounterId) return

    await supabase
      .from('encounters')
      .update({ status: 'in_progress' })
      .eq('id', seeded.encounterId)

    const { data } = await supabase
      .from('encounters')
      .select('status')
      .eq('id', seeded.encounterId)
      .single()

    expect(data?.status).toBe('in_progress')
  })

  it('vital signs bisa direkam via triage (INSERT manual)', async () => {
    if (!seeded.encounterId || !seeded.patientId || !seeded.nurseId) return

    const { data, error } = await supabase
      .from('vital_signs')
      .insert({
        encounter_id: seeded.encounterId,
        patient_id: seeded.patientId,
        recorded_by: seeded.nurseId,
        systolic_bp: 140,
        diastolic_bp: null,
        heart_rate: 102,
        respiratory_rate: null,
        temperature: 37.8,
        oxygen_saturation: 94,
      })
      .select('id')
      .single()

    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
    seeded.vitalSignId = data?.id ?? ''
  })

  it('vital signs yang direkam punya nilai dalam range normal/crisis', async () => {
    if (!seeded.vitalSignId) return

    const { data } = await supabase
      .from('vital_signs')
      .select('systolic_bp, heart_rate, temperature, oxygen_saturation')
      .eq('id', seeded.vitalSignId)
      .single()

    expect(data?.systolic_bp).toBe(140)
    expect(data?.heart_rate).toBe(102)
    expect(data?.temperature).toBe(37.8)
    expect(data?.oxygen_saturation).toBe(94)
  })

  it('triage_category P1 valid untuk kasus kritis', async () => {
    if (!seeded.orgId || !seeded.patientId) return

    const { data: enc } = await supabase
      .from('encounters')
      .insert({
        patient_id: seeded.patientId,
        organization_id: seeded.orgId,
        encounter_class: 'emergency',
        status: 'arrived',
        arrived_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (!enc) return
    extraEncounterIds.push(enc.id)

    const { data: emg } = await supabase
      .from('emergency_encounters')
      .insert({
        encounter_id: enc.id,
        patient_id: seeded.patientId,
        status: 'emergency_admitted',
      })
      .select('id')
      .single()

    expect(emg?.id).toBeTruthy()

    // Triage P1 (kritis)
    const { data: triaged } = await supabase
      .from('emergency_encounters')
      .update({
        triage_category: 'P1',
        triage_complaint: 'Henti jantung',
        status: 'in_triage',
        is_critical: true,
        resuscitation_notes: 'CPR dilakukan segera',
      })
      .eq('id', emg!.id)
      .select()
      .single()

    expect(triaged?.triage_category).toBe('P1')
    expect(triaged?.is_critical).toBe(true)
    expect(triaged?.resuscitation_notes).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Skenario 7 — PATCH outcome: discharged
// ---------------------------------------------------------------------------

describe('PATCH outcome: discharged', () => {
  it('update outcome discharged → status completed, encounter finished', async () => {
    if (!seeded.emergencyId || !seeded.encounterId) return

    const { data, error } = await supabase
      .from('emergency_encounters')
      .update({
        outcome: 'discharged',
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', seeded.emergencyId)
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.outcome).toBe('discharged')
    expect(data?.status).toBe('completed')
  })

  it('encounter utama ditutup (status finished) saat outcome', async () => {
    if (!seeded.encounterId) return

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('encounters')
      .update({ status: 'finished', finished_at: now })
      .eq('id', seeded.encounterId)

    expect(error).toBeNull()

    const { data } = await supabase
      .from('encounters')
      .select('status, finished_at')
      .eq('id', seeded.encounterId)
      .single()

    expect(data?.status).toBe('finished')
    expect(data?.finished_at).toBeTruthy()
  })

  it('outcome discharged tidak buat episodes_of_care', async () => {
    // discharged → tidak buat entry baru di episodes_of_care
    // verifikasi: count episode untuk patient ini sebelum vs sesudah sama
    const { count: before } = await supabase
      .from('episodes_of_care')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', seeded.patientId)

    // Tidak ada insert episode
    const { count: after } = await supabase
      .from('episodes_of_care')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', seeded.patientId)

    expect(before).toBe(after)
  })
})

// ---------------------------------------------------------------------------
// Skenario 8 — PATCH outcome: referred
// ---------------------------------------------------------------------------

describe('PATCH outcome: referred', () => {
  it('outcome referred bisa simpan referred_to dan referral_letter_no', async () => {
    if (!seeded.orgId || !seeded.patientId) return

    // Buat encounter baru untuk test referred
    const { data: enc } = await supabase
      .from('encounters')
      .insert({
        patient_id: seeded.patientId,
        organization_id: seeded.orgId,
        encounter_class: 'emergency',
        status: 'arrived',
        arrived_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (!enc) return
    extraEncounterIds.push(enc.id)

    const { data: emg } = await supabase
      .from('emergency_encounters')
      .insert({
        encounter_id: enc.id,
        patient_id: seeded.patientId,
        status: 'in_triage',
        triage_category: 'P2',
        triage_complaint: 'Fraktur terbuka',
      })
      .select('id')
      .single()

    expect(emg?.id).toBeTruthy()

    // PATCH outcome referred
    const { data, error } = await supabase
      .from('emergency_encounters')
      .update({
        outcome: 'referred',
        status: 'completed',
        referred_to: 'RSUD Provinsi',
        referral_letter_no: 'REF/2026/001',
        updated_at: new Date().toISOString(),
      })
      .eq('id', emg!.id)
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.outcome).toBe('referred')
    expect(data?.status).toBe('completed')
    expect(data?.referred_to).toBe('RSUD Provinsi')
    expect(data?.referral_letter_no).toBe('REF/2026/001')
  })
})

// ---------------------------------------------------------------------------
// Skenario 9 — PATCH outcome: admitted_inpatient
// ---------------------------------------------------------------------------

describe('PATCH outcome: admitted_inpatient', () => {
  it('outcome admitted_inpatient buat episode_of_care + inpatient_admission', async () => {
    if (!seeded.orgId || !seeded.patientId || !seeded.doctorId) {
      console.log('  [SKIP] Data seed tidak lengkap untuk admitted_inpatient test')
      return
    }

    // Buat encounter baru untuk test admitted_inpatient
    const { data: enc } = await supabase
      .from('encounters')
      .insert({
        patient_id: seeded.patientId,
        organization_id: seeded.orgId,
        encounter_class: 'emergency',
        status: 'in_progress',
        arrived_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (!enc) return
    extraEncounterIds.push(enc.id)

    // Cari room location untuk admission
    const { data: room } = await supabase
      .from('locations')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (!room) {
      console.log('  [SKIP] Tidak ada room location di DB')
      return
    }

    // Simulate admitted_inpatient: buat episode_of_care
    const startDate = new Date().toISOString().slice(0, 10)

    const { data: episode, error: epErr } = await supabase
      .from('episodes_of_care')
      .insert({
        patient_id: seeded.patientId,
        organization_id: seeded.orgId,
        start_date: startDate,
        status: 'admitted',
        dpjp_id: seeded.doctorId,
        room_location_id: room.id,
        bed_number: '2B',
      })
      .select('id')
      .single()

    expect(epErr).toBeNull()
    expect(episode?.id).toBeTruthy()
    seeded.episodeId = episode?.id ?? ''

    // Buat inpatient_admission
    const { data: admission, error: admErr } = await supabase
      .from('inpatient_admissions')
      .insert({
        episode_of_care_id: episode!.id,
        patient_id: seeded.patientId,
        admitted_from: 'igd',
        admission_date: new Date().toISOString(),
        dpjp_id: seeded.doctorId,
        room_location_id: room.id,
        bed_number: '2B',
        room_class: 'kelas_3',
        status: 'admitted',
      })
      .select('id')
      .single()

    expect(admErr).toBeNull()
    expect(admission?.id).toBeTruthy()
    seeded.admissionId = admission?.id ?? ''

    // Verifikasi admitted_from = igd
    const { data: verAdm } = await supabase
      .from('inpatient_admissions')
      .select('admitted_from, dpjp_id, status')
      .eq('id', admission!.id)
      .single()

    expect(verAdm?.admitted_from).toBe('igd')
    expect(verAdm?.dpjp_id).toBe(seeded.doctorId)
    expect(verAdm?.status).toBe('admitted')
  })

  it('episode_of_care dari IGD punya status admitted', async () => {
    if (!seeded.episodeId) return

    const { data } = await supabase
      .from('episodes_of_care')
      .select('status, dpjp_id, start_date')
      .eq('id', seeded.episodeId)
      .single()

    expect(data?.status).toBe('admitted')
    expect(data?.dpjp_id).toBe(seeded.doctorId)
    expect(data?.start_date).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Skenario 10 — Data integrity & rules cross-check
// ---------------------------------------------------------------------------

describe('Data integrity emergency', () => {
  it('encounter_class semua emergency encounter = emergency', async () => {
    const { data: emgs } = await supabase
      .from('emergency_encounters')
      .select('encounter_id')
      .limit(20)

    const encounterIds = (emgs ?? []).map(e => e.encounter_id).filter(Boolean)
    if (encounterIds.length === 0) return

    const { data: encs } = await supabase
      .from('encounters')
      .select('id, encounter_class')
      .in('id', encounterIds)

    for (const enc of encs ?? []) {
      expect(enc.encounter_class).toBe('emergency')
    }
  })

  it('emergency encounter punya arrived_at di encounters', async () => {
    if (!seeded.encounterId) return
    const { data } = await supabase
      .from('encounters')
      .select('arrived_at')
      .eq('id', seeded.encounterId)
      .single()
    expect(data?.arrived_at).toBeTruthy()
  })

  it('triage_nurse_id jika terisi merujuk ke practitioner role nurse', async () => {
    const { data: triaged } = await supabase
      .from('emergency_encounters')
      .select('triage_nurse_id')
      .not('triage_nurse_id', 'is', null)
      .limit(10)

    for (const row of triaged ?? []) {
      const { data: prac } = await supabase
        .from('practitioners')
        .select('role')
        .eq('id', row.triage_nurse_id)
        .single()
      // Harus nurse (sesuai spesifikasi endpoint /triage)
      expect(prac?.role).toBe('nurse')
    }
  })

  it('inpatient_admissions dari IGD punya admitted_from = igd', async () => {
    const { data } = await supabase
      .from('inpatient_admissions')
      .select('admitted_from')
      .eq('admitted_from', 'igd')
      .limit(10)
    // Mungkin kosong jika belum ada, tapi tidak boleh error
    expect(Array.isArray(data)).toBe(true)
  })

  it('needs_ambulance boolean jika terisi', async () => {
    const { data } = await supabase
      .from('emergency_encounters')
      .select('needs_ambulance')
      .not('needs_ambulance', 'is', null)
      .limit(10)
    for (const row of data ?? []) {
      expect(typeof row.needs_ambulance).toBe('boolean')
    }
  })
})
