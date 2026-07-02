import { describe, it, expect } from 'vitest'
import { SS_AUTH_URL, SS_FHIR_URL, FHIR, encounterIdentifierSystem } from '@/lib/satusehat/config'

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
