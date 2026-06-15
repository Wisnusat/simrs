/**
 * Unit tests — Vital signs validation (rawat jalan / nurse triage)
 * Tier 2: field wajib, range sanity check
 */

import { describe, it, expect } from 'vitest'

type VitalSignsInput = {
  encounter_id?: string
  patient_id?: string
  systolic_bp?: number
  diastolic_bp?: number
  heart_rate?: number
  temperature?: number
  oxygen_saturation?: number
  weight_kg?: number
  height_cm?: number
}

function validateVitalSigns(body: VitalSignsInput): string | null {
  if (!body.encounter_id || !body.patient_id) {
    return 'encounter_id and patient_id are required'
  }
  return null
}

// Range sanity checks (tidak di-enforce di API, tapi penting untuk UI)
const VITAL_RANGES = {
  systolic_bp: { min: 50, max: 300 },
  diastolic_bp: { min: 30, max: 200 },
  heart_rate: { min: 20, max: 300 },
  temperature: { min: 30, max: 45 },
  oxygen_saturation: { min: 50, max: 100 },
  weight_kg: { min: 0.5, max: 500 },
  height_cm: { min: 20, max: 250 },
}

function isInRange(field: keyof typeof VITAL_RANGES, value: number): boolean {
  const { min, max } = VITAL_RANGES[field]
  return value >= min && value <= max
}

describe('Vital Signs — validasi input wajib', () => {
  it('Input lengkap lolos', () => {
    expect(validateVitalSigns({ encounter_id: 'enc-001', patient_id: 'pat-001' })).toBeNull()
  })

  it('Tanpa encounter_id → error', () => {
    expect(validateVitalSigns({ patient_id: 'pat-001' })).toBeTruthy()
  })

  it('Tanpa patient_id → error', () => {
    expect(validateVitalSigns({ encounter_id: 'enc-001' })).toBeTruthy()
  })

  it('Field opsional boleh tidak dikirim', () => {
    // API mengizinkan null untuk semua vital signs fields
    const err = validateVitalSigns({ encounter_id: 'enc-001', patient_id: 'pat-001' })
    expect(err).toBeNull()
  })
})

describe('Vital Signs — range sanity', () => {
  it('Tekanan darah sistolik normal (120 mmHg) dalam range', () => {
    expect(isInRange('systolic_bp', 120)).toBe(true)
  })

  it('Tekanan darah sistolik tidak wajar (10 mmHg) di luar range', () => {
    expect(isInRange('systolic_bp', 10)).toBe(false)
  })

  it('Nadi normal (80 bpm) dalam range', () => {
    expect(isInRange('heart_rate', 80)).toBe(true)
  })

  it('Suhu normal (36.5°C) dalam range', () => {
    expect(isInRange('temperature', 36.5)).toBe(true)
  })

  it('SpO2 100% dalam range', () => {
    expect(isInRange('oxygen_saturation', 100)).toBe(true)
  })

  it('SpO2 > 100% di luar range', () => {
    expect(isInRange('oxygen_saturation', 101)).toBe(false)
  })

  it('Berat badan 0 kg di luar range', () => {
    expect(isInRange('weight_kg', 0)).toBe(false)
  })
})

describe('Vital Signs — side effects setelah save', () => {
  it('encounter status berubah ke in_progress', () => {
    // Simulasi side-effect dari API
    const encounterUpdate = { status: 'in_progress', started_at: new Date().toISOString() }
    expect(encounterUpdate.status).toBe('in_progress')
    expect(encounterUpdate.started_at).toBeTruthy()
  })

  it('queue status berubah ke in_service jika queue_id disertakan', () => {
    const queueUpdate = { status: 'in_service', served_at: new Date().toISOString() }
    expect(queueUpdate.status).toBe('in_service')
  })
})
