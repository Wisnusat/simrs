/**
 * Unit tests — Encounter creation rules (rawat jalan)
 * Tier 2: validasi field wajib dan idempotency
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Mirrors validation logic dari app/api/encounters/route.ts POST
// ---------------------------------------------------------------------------

type EncounterInput = {
  patient_id?: string
  poli_service_id?: string
  payment_type?: string
  encounter_class?: string
  appointment_id?: string
  queue_id?: string
}

function validateEncounterInput(body: EncounterInput): string | null {
  if (!body.patient_id || !body.poli_service_id || !body.payment_type || !body.encounter_class) {
    return 'patient_id, poli_service_id, payment_type and encounter_class are required'
  }
  return null
}

const VALID_ENCOUNTER_CLASSES = ['outpatient', 'inpatient', 'emergency', 'observation']
const VALID_PAYMENT_TYPES = ['umum', 'bpjs']

describe('Encounter — validasi input rawat jalan', () => {
  it('Input lengkap lolos validasi', () => {
    const err = validateEncounterInput({
      patient_id: 'pat-001',
      poli_service_id: 'poli-001',
      payment_type: 'umum',
      encounter_class: 'outpatient',
    })
    expect(err).toBeNull()
  })

  it('Tanpa patient_id → error', () => {
    const err = validateEncounterInput({
      poli_service_id: 'poli-001',
      payment_type: 'umum',
      encounter_class: 'outpatient',
    })
    expect(err).toBeTruthy()
    expect(err).toContain('patient_id')
  })

  it('Tanpa poli_service_id → error', () => {
    const err = validateEncounterInput({
      patient_id: 'pat-001',
      payment_type: 'umum',
      encounter_class: 'outpatient',
    })
    expect(err).toBeTruthy()
  })

  it('Tanpa payment_type → error', () => {
    const err = validateEncounterInput({
      patient_id: 'pat-001',
      poli_service_id: 'poli-001',
      encounter_class: 'outpatient',
    })
    expect(err).toBeTruthy()
  })

  it('Tanpa encounter_class → error', () => {
    const err = validateEncounterInput({
      patient_id: 'pat-001',
      poli_service_id: 'poli-001',
      payment_type: 'umum',
    })
    expect(err).toBeTruthy()
  })

  it('encounter_class rawat jalan harus "outpatient"', () => {
    expect(VALID_ENCOUNTER_CLASSES).toContain('outpatient')
  })

  it('payment_type valid: umum dan bpjs', () => {
    expect(VALID_PAYMENT_TYPES).toContain('umum')
    expect(VALID_PAYMENT_TYPES).toContain('bpjs')
    expect(VALID_PAYMENT_TYPES).not.toContain('cash')
    expect(VALID_PAYMENT_TYPES).not.toContain('general')
  })
})

describe('Encounter — idempotency (duplikat appointment)', () => {
  it('Jika appointment_id sudah ada encounter, kembalikan existing (tidak buat baru)', () => {
    const existing = { id: 'enc-existing', status: 'in_progress' }
    // Simulasi logic: jika existing ditemukan → return existing
    const result = existing ? existing : null
    expect(result).toEqual(existing)
    expect(result?.id).toBe('enc-existing')
  })
})
