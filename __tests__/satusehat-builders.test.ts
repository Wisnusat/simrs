import { describe, it, expect } from 'vitest'
import { SS_AUTH_URL, SS_FHIR_URL, FHIR, encounterIdentifierSystem } from '@/lib/satusehat/config'
import { buildPatientPayload } from '@/lib/satusehat/patient-service'

describe('satusehat config', () => {
  it('builds staging URLs', () => {
    expect(SS_AUTH_URL).toBe('https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1/accesstoken?grant_type=client_credentials')
    expect(SS_FHIR_URL).toBe('https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1')
  })
  it('exposes FHIR code systems', () => {
    expect(FHIR.nik).toBe('https://fhir.kemkes.go.id/id/nik')
    expect(FHIR.icd10).toBe('http://hl7.org/fhir/sid/icd-10')
    expect(encounterIdentifierSystem('100012345')).toBe('http://sys-ids.kemkes.go.id/encounter/100012345')
  })
})

describe('buildPatientPayload', () => {
  const base = {
    id: 'uuid-1', nik: '3174012345678901', full_name: 'Budi Santoso',
    gender: 'male' as const, date_of_birth: '1990-05-17',
    address: 'Jl. Melati 1', city: 'Jakarta', postal_code: '12420', phone: '081234567890',
  }
  it('builds a FHIR Patient with NIK identifier', () => {
    const p: any = buildPatientPayload(base)
    expect(p.resourceType).toBe('Patient')
    expect(p.identifier[0]).toEqual({ use: 'official', system: 'https://fhir.kemkes.go.id/id/nik', value: '3174012345678901' })
    expect(p.name[0].text).toBe('Budi Santoso')
    expect(p.gender).toBe('male')
    expect(p.birthDate).toBe('1990-05-17')
    expect(p.address[0].city).toBe('Jakarta')
    expect(p.telecom[0].value).toBe('081234567890')
  })
  it('omits empty address/telecom', () => {
    const p: any = buildPatientPayload({ ...base, address: null, city: null, postal_code: null, phone: null })
    expect(p.address).toBeUndefined()
    expect(p.telecom).toBeUndefined()
  })
})
