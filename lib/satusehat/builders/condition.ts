import { FHIR } from '../config'
import { patientRef, encounterRef } from './common'

export interface ConditionInput {
  icd10Code: string; icd10Display: string
  clinicalStatus: string | null; onsetDate: string | null
  patientIhs: string; patientName: string; ssEncounterId: string
}

export function buildCondition(i: ConditionInput): object {
  return {
    resourceType: 'Condition',
    clinicalStatus: { coding: [{ system: FHIR.conditionClinical, code: i.clinicalStatus ?? 'active' }] },
    category: [{ coding: [{ system: FHIR.conditionCategory, code: 'encounter-diagnosis', display: 'Encounter Diagnosis' }] }],
    code: { coding: [{ system: FHIR.icd10, code: i.icd10Code, display: i.icd10Display }] },
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    ...(i.onsetDate ? { onsetDateTime: i.onsetDate } : {}),
  }
}
