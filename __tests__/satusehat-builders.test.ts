import { describe, it, expect } from 'vitest'
import { SS_AUTH_URL, SS_FHIR_URL, FHIR, encounterIdentifierSystem } from '@/lib/satusehat/config'
import { buildPatientPayload } from '@/lib/satusehat/patient-service'
import { buildEncounter } from '@/lib/satusehat/builders/encounter'

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

describe('buildEncounter', () => {
  const input = {
    localId: 'enc-uuid-1', orgId: '100012345',
    encClass: 'outpatient' as const, status: 'finished' as const,
    patientIhs: 'P0001', patientName: 'Budi Santoso',
    practitionerIhs: 'N10000001', practitionerName: 'dr. Ani',
    ssLocationId: 'loc-ss-1', locationName: 'Poli Umum',
    arrivedAt: '2026-07-01T08:00:00+07:00',
    startedAt: '2026-07-01T08:30:00+07:00',
    finishedAt: '2026-07-01T09:00:00+07:00',
  }
  it('maps class, refs, identifier system', () => {
    const e: any = buildEncounter(input)
    expect(e.resourceType).toBe('Encounter')
    expect(e.class.code).toBe('AMB')
    expect(e.status).toBe('finished')
    expect(e.identifier[0].system).toBe('http://sys-ids.kemkes.go.id/encounter/100012345')
    expect(e.identifier[0].value).toBe('enc-uuid-1')
    expect(e.subject.reference).toBe('Patient/P0001')
    expect(e.participant[0].individual.reference).toBe('Practitioner/N10000001')
    expect(e.location[0].location.reference).toBe('Location/loc-ss-1')
    expect(e.serviceProvider.reference).toBe('Organization/100012345')
  })
  it('builds full statusHistory from timestamps', () => {
    const e: any = buildEncounter(input)
    expect(e.statusHistory).toEqual([
      { status: 'arrived', period: { start: '2026-07-01T08:00:00+07:00', end: '2026-07-01T08:30:00+07:00' } },
      { status: 'in-progress', period: { start: '2026-07-01T08:30:00+07:00', end: '2026-07-01T09:00:00+07:00' } },
      { status: 'finished', period: { start: '2026-07-01T09:00:00+07:00' } },
    ])
    expect(e.period).toEqual({ start: '2026-07-01T08:00:00+07:00', end: '2026-07-01T09:00:00+07:00' })
  })
  it('maps inpatient → IMP and emergency → EMER', () => {
    expect((buildEncounter({ ...input, encClass: 'inpatient' }) as any).class.code).toBe('IMP')
    expect((buildEncounter({ ...input, encClass: 'emergency' }) as any).class.code).toBe('EMER')
  })
})
