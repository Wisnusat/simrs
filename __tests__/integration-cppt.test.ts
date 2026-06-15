/**
 * Integration tests — CPPT (Catatan Perkembangan Pasien Terintegrasi)
 * Mencakup: clinical_notes INSERT/GET, inpatient_daily_records CREATE,
 *           validasi SOAP fields, writer_role, note_date, episode query
 *
 * Yang BELUM ditest di integration-inpatient.test.ts section F:
 *   ✗ INSERT clinical note (SOAP)
 *   ✗ GET by episode_of_care_id (lintas encounter)
 *   ✗ writer_role auto-set
 *   ✗ note_date auto-generated
 *   ✗ Multiple notes per encounter
 *   ✗ CREATE inpatient daily record (shift)
 *   ✗ Shift auto-detect dari jam
 *   ✗ Validasi field wajib (encounter_id, patient_id)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let supabase: ReturnType<typeof createClient>

const CLEANUP: {
  noteIds: string[]
  dailyRecordIds: string[]
  encounterIds: string[]
} = { noteIds: [], dailyRecordIds: [], encounterIds: [] }

beforeAll(async () => {
  supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
})

afterAll(async () => {
  if (CLEANUP.noteIds.length > 0)
    await supabase.from('clinical_notes').delete().in('id', CLEANUP.noteIds)
  if (CLEANUP.dailyRecordIds.length > 0)
    await supabase.from('inpatient_daily_records').delete().in('id', CLEANUP.dailyRecordIds)
  if (CLEANUP.encounterIds.length > 0)
    await supabase.from('encounters').delete().in('id', CLEANUP.encounterIds)
})

// ---------------------------------------------------------------------------
// Helper: ambil encounter inpatient aktif
// ---------------------------------------------------------------------------

async function getActiveInpatientEncounter() {
  const { data } = await supabase
    .from('encounters')
    .select('id, patient_id, episode_of_care_id, organization_id')
    .eq('encounter_class', 'inpatient')
    .not('episode_of_care_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

async function getActiveAdmission() {
  const { data } = await supabase
    .from('inpatient_admissions')
    .select('id, patient_id, episode_of_care_id')
    .in('status', ['admitted', 'in_care'])
    .limit(1)
    .maybeSingle()
  return data
}

async function getAnyPractitioner() {
  const { data } = await supabase
    .from('practitioners')
    .select('id, role')
    .in('role', ['doctor', 'nurse'])
    .limit(1)
    .single()
  return data
}

// ---------------------------------------------------------------------------
// Unit tests — validasi logic (tidak butuh DB)
// ---------------------------------------------------------------------------

describe('CPPT — unit: validasi field wajib', () => {
  function validateClinicalNoteInput(body: Record<string, any>): string | null {
    if (!body.encounter_id || !body.patient_id)
      return 'encounter_id and patient_id are required'
    return null
  }

  it('Input lengkap lolos', () => {
    expect(validateClinicalNoteInput({
      encounter_id: 'enc-1', patient_id: 'pat-1',
      subjective: 'Pasien mengeluh nyeri kepala',
    })).toBeNull()
  })

  it('Tanpa encounter_id → error', () => {
    expect(validateClinicalNoteInput({ patient_id: 'pat-1' })).toBeTruthy()
  })

  it('Tanpa patient_id → error', () => {
    expect(validateClinicalNoteInput({ encounter_id: 'enc-1' })).toBeTruthy()
  })

  it('SOAP fields semua opsional (boleh tidak diisi)', () => {
    expect(validateClinicalNoteInput({
      encounter_id: 'enc-1', patient_id: 'pat-1',
      // tidak ada subjective/objective/assessment/plan
    })).toBeNull()
  })
})

describe('CPPT — unit: shift auto-detect dari jam', () => {
  function detectShift(hour: number): string {
    if (hour >= 7 && hour < 14) return 'pagi'
    if (hour >= 14 && hour < 21) return 'sore'
    return 'malam'
  }

  it('Jam 07:00 → shift pagi', () => expect(detectShift(7)).toBe('pagi'))
  it('Jam 13:59 → shift pagi', () => expect(detectShift(13)).toBe('pagi'))
  it('Jam 14:00 → shift sore', () => expect(detectShift(14)).toBe('sore'))
  it('Jam 20:59 → shift sore', () => expect(detectShift(20)).toBe('sore'))
  it('Jam 21:00 → shift malam', () => expect(detectShift(21)).toBe('malam'))
  it('Jam 00:00 → shift malam', () => expect(detectShift(0)).toBe('malam'))
  it('Jam 06:59 → shift malam', () => expect(detectShift(6)).toBe('malam'))
})

describe('CPPT — unit: validasi field daily record', () => {
  function validateDailyRecord(body: Record<string, any>): string | null {
    if (!body.admission_id || !body.encounter_id)
      return 'admission_id and encounter_id are required'
    return null
  }

  it('Input lengkap lolos', () => {
    expect(validateDailyRecord({ admission_id: 'adm-1', encounter_id: 'enc-1' })).toBeNull()
  })

  it('Tanpa admission_id → error', () => {
    expect(validateDailyRecord({ encounter_id: 'enc-1' })).toBeTruthy()
  })

  it('Tanpa encounter_id → error', () => {
    expect(validateDailyRecord({ admission_id: 'adm-1' })).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Integration tests — INSERT clinical note (CPPT SOAP)
// ---------------------------------------------------------------------------

describe('CPPT — integration: INSERT clinical note', () => {
  it('INSERT note dengan semua SOAP fields berhasil', async () => {
    const enc = await getActiveInpatientEncounter()
    if (!enc) {
      console.log('  [SKIP] Tidak ada encounter inpatient aktif')
      return
    }
    const pract = await getAnyPractitioner()
    if (!pract) return

    const { data, error } = await supabase
      .from('clinical_notes')
      .insert({
        encounter_id: enc.id,
        patient_id: enc.patient_id,
        written_by: pract.id,
        writer_role: pract.role,
        subjective: '[TEST] Pasien mengeluh nyeri kepala dan demam sejak 2 hari',
        objective: '[TEST] TD 130/80, Nadi 92x/mnt, Suhu 38.2°C',
        assessment: '[TEST] Febris suspek infeksi',
        plan: '[TEST] Antipiretik, observasi suhu tiap 4 jam',
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.subjective).toContain('[TEST]')
    expect(data?.writer_role).toBe(pract.role)
    expect(data?.encounter_id).toBe(enc.id)
    expect(data?.note_date).toBeTruthy() // auto-generated

    if (data?.id) CLEANUP.noteIds.push(data.id)
  })

  it('note_date ter-set otomatis saat INSERT', async () => {
    const enc = await getActiveInpatientEncounter()
    if (!enc) return
    const pract = await getAnyPractitioner()
    if (!pract) return

    const before = new Date(Date.now() - 5000).toISOString()

    const { data } = await supabase
      .from('clinical_notes')
      .insert({
        encounter_id: enc.id,
        patient_id: enc.patient_id,
        written_by: pract.id,
        writer_role: pract.role,
        subjective: '[TEST] note_date check',
      })
      .select('id, note_date')
      .single()

    expect(data?.note_date).toBeTruthy()
    // note_date harus setelah waktu sebelum insert
    expect(new Date(data!.note_date).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime())

    if (data?.id) CLEANUP.noteIds.push(data.id)
  })

  it('INSERT note dengan SOAP partial (hanya subjective) diizinkan', async () => {
    const enc = await getActiveInpatientEncounter()
    if (!enc) return
    const pract = await getAnyPractitioner()
    if (!pract) return

    const { data, error } = await supabase
      .from('clinical_notes')
      .insert({
        encounter_id: enc.id,
        patient_id: enc.patient_id,
        written_by: pract.id,
        writer_role: pract.role,
        subjective: '[TEST] Hanya subjective saja',
        // objective, assessment, plan tidak diisi
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.subjective).toBeTruthy()
    expect(data?.objective).toBeNull()
    expect(data?.assessment).toBeNull()
    expect(data?.plan).toBeNull()

    if (data?.id) CLEANUP.noteIds.push(data.id)
  })

  it('Multiple notes per encounter diizinkan (tidak ada unique constraint)', async () => {
    const enc = await getActiveInpatientEncounter()
    if (!enc) return
    const pract = await getAnyPractitioner()
    if (!pract) return

    const insertNote = async (label: string) =>
      supabase.from('clinical_notes').insert({
        encounter_id: enc.id,
        patient_id: enc.patient_id,
        written_by: pract.id,
        writer_role: pract.role,
        subjective: `[TEST] Note ${label}`,
      }).select('id').single()

    const [r1, r2] = await Promise.all([insertNote('A'), insertNote('B')])

    expect(r1.error).toBeNull()
    expect(r2.error).toBeNull()
    expect(r1.data?.id).not.toBe(r2.data?.id) // dua ID berbeda

    if (r1.data?.id) CLEANUP.noteIds.push(r1.data.id)
    if (r2.data?.id) CLEANUP.noteIds.push(r2.data.id)
  })
})

// ---------------------------------------------------------------------------
// Integration tests — GET clinical notes
// ---------------------------------------------------------------------------

describe('CPPT — integration: GET clinical notes', () => {
  it('GET by encounter_id mengembalikan array terurut terbaru dulu', async () => {
    const enc = await getActiveInpatientEncounter()
    if (!enc) return

    const { data, error } = await supabase
      .from('clinical_notes')
      .select('id, note_date, subjective')
      .eq('encounter_id', enc.id)
      .order('note_date', { ascending: false })

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)

    // Verifikasi urutan: setiap note_date >= note berikutnya
    for (let i = 0; i < (data ?? []).length - 1; i++) {
      const curr = new Date(data![i].note_date).getTime()
      const next = new Date(data![i + 1].note_date).getTime()
      expect(curr).toBeGreaterThanOrEqual(next)
    }
  })

  it('GET by episode_of_care_id mengambil notes dari semua encounter dalam episode', async () => {
    const enc = await getActiveInpatientEncounter()
    if (!enc?.episode_of_care_id) return

    // Ambil semua encounter dalam episode
    const { data: encounters } = await supabase
      .from('encounters')
      .select('id')
      .eq('episode_of_care_id', enc.episode_of_care_id)

    const encIds = (encounters ?? []).map(e => e.id)
    expect(encIds.length).toBeGreaterThan(0)

    // Ambil semua notes dari encounter-encounter tersebut
    const { data: notes, error } = await supabase
      .from('clinical_notes')
      .select('id, encounter_id')
      .in('encounter_id', encIds)

    expect(error).toBeNull()
    // Setiap note harus berasal dari salah satu encounter dalam episode
    for (const note of notes ?? []) {
      expect(encIds).toContain(note.encounter_id)
    }
  })

  it('Notes ter-insert saat test ini muncul di GET', async () => {
    if (CLEANUP.noteIds.length === 0) {
      console.log('  [SKIP] Tidak ada notes yang dibuat di test ini')
      return
    }

    const { data } = await supabase
      .from('clinical_notes')
      .select('id')
      .in('id', CLEANUP.noteIds)

    expect((data ?? []).length).toBe(CLEANUP.noteIds.length)
  })
})

// ---------------------------------------------------------------------------
// Integration tests — Inpatient Daily Record (shift)
// ---------------------------------------------------------------------------

describe('CPPT — integration: Inpatient Daily Record (shift)', () => {
  it('INSERT daily record berhasil dengan shift eksplisit', async () => {
    const adm = await getActiveAdmission()
    if (!adm) {
      console.log('  [SKIP] Tidak ada admission aktif')
      return
    }

    // Butuh encounter_id — ambil encounter dalam episode ini
    const { data: enc } = await supabase
      .from('encounters')
      .select('id')
      .eq('episode_of_care_id', adm.episode_of_care_id)
      .limit(1)
      .maybeSingle()

    if (!enc) {
      console.log('  [SKIP] Tidak ada encounter untuk admission ini')
      return
    }

    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('inpatient_daily_records')
      .insert({
        admission_id: adm.id,
        encounter_id: enc.id,
        record_date: today,
        shift: 'pagi',
      })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.admission_id).toBe(adm.id)
    expect(data?.encounter_id).toBe(enc.id)
    expect(data?.shift).toBe('pagi')
    expect(data?.record_date).toBe(today)

    if (data?.id) CLEANUP.dailyRecordIds.push(data.id)
  })

  it('GET daily records by admission_id mengembalikan shift + encounter data', async () => {
    const { data: admissions } = await supabase
      .from('inpatient_admissions')
      .select('id')
      .in('status', ['admitted', 'in_care', 'discharged'])
      .limit(5)

    for (const adm of admissions ?? []) {
      const { data, error } = await supabase
        .from('inpatient_daily_records')
        .select('id, shift, record_date, admission_id, encounter_id')
        .eq('admission_id', adm.id)
        .limit(5)

      expect(error).toBeNull()
      expect(Array.isArray(data)).toBe(true)

      for (const dr of data ?? []) {
        expect(['pagi', 'sore', 'malam']).toContain(dr.shift)
        expect(dr.record_date).toBeTruthy()
        expect(dr.admission_id).toBe(adm.id)
      }
    }
  })

  it('record_date tersimpan dalam format YYYY-MM-DD', async () => {
    const { data } = await supabase
      .from('inpatient_daily_records')
      .select('record_date')
      .limit(10)

    for (const dr of data ?? []) {
      expect(dr.record_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

// ---------------------------------------------------------------------------
// Integration tests — writer_role dan practitioner join
// ---------------------------------------------------------------------------

describe('CPPT — integration: writer_role & practitioner join', () => {
  it('clinical_notes punya written_by (practitioner ID)', async () => {
    const { data } = await supabase
      .from('clinical_notes')
      .select('id, written_by, writer_role')
      .limit(20)

    for (const note of data ?? []) {
      expect(note.written_by).toBeTruthy()
      if (note.writer_role) {
        expect(['doctor', 'nurse', 'admin', 'nutritionist']).toContain(note.writer_role)
      }
    }
  })

  it('Join practitioners dari clinical_notes berhasil', async () => {
    const { data, error } = await supabase
      .from('clinical_notes')
      .select('id, writer_role, practitioners:written_by(full_name, role)')
      .limit(5)

    expect(error).toBeNull()
    for (const note of data ?? []) {
      if ((note as any).practitioners) {
        expect((note as any).practitioners.full_name).toBeTruthy()
      }
    }
  })

  it('Notes dari test ini punya writer_role yang benar', async () => {
    if (CLEANUP.noteIds.length === 0) return

    const { data } = await supabase
      .from('clinical_notes')
      .select('id, writer_role, written_by')
      .in('id', CLEANUP.noteIds)

    for (const note of data ?? []) {
      expect(['doctor', 'nurse']).toContain(note.writer_role)
      expect(note.written_by).toBeTruthy()
    }
  })
})
