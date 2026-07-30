const BASE = process.env.SATUSEHAT_BASE_URL ?? 'https://api-satusehat-stg.dto.kemkes.go.id'

export const SS_AUTH_URL = `${BASE}/oauth2/v1/accesstoken?grant_type=client_credentials`
export const SS_FHIR_URL = `${BASE}/fhir-r4/v1`

export function ssConfig() {
  const orgId = process.env.SATUSEHAT_ORG_ID
  const clientId = process.env.SATUSEHAT_CLIENT_ID
  const clientSecret = process.env.SATUSEHAT_CLIENT_SECRET
  if (!orgId || !clientId || !clientSecret) {
    throw new Error('Missing env: SATUSEHAT_ORG_ID / SATUSEHAT_CLIENT_ID / SATUSEHAT_CLIENT_SECRET')
  }
  return { orgId, clientId, clientSecret }
}

export const FHIR = {
  nik: 'https://fhir.kemkes.go.id/id/nik',
  ihs: 'https://fhir.kemkes.go.id/id/ihs-number',
  icd10: 'http://hl7.org/fhir/sid/icd-10',
  icd9cm: 'http://hl7.org/fhir/sid/icd-9-cm',
  loinc: 'http://loinc.org',
  kfa: 'http://sys-ids.kemkes.go.id/kfa',
  ucum: 'http://unitsofmeasure.org',
  actCode: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  participationType: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
  obsCategory: 'http://terminology.hl7.org/CodeSystem/observation-category',
  conditionClinical: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  conditionCategory: 'http://terminology.hl7.org/CodeSystem/condition-category',
  allergyClinical: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
  allergyVerification: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
} as const

export const encounterIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/encounter/${orgId}`
export const prescriptionIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/prescription/${orgId}`
export const prescriptionItemIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/prescription-item/${orgId}`
export const medicationIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/medication/${orgId}`
export const compositionIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/composition/${orgId}`
export const serviceRequestIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/servicerequest/${orgId}`
export const diagnosticReportIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/diagnostic/${orgId}`
export const episodeOfCareIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/episode-of-care/${orgId}`
export const nutritionOrderIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/nutrition-order/${orgId}`
