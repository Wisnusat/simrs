import { FHIR } from '../config'
import { patientRef, practitionerRef, encounterRef } from './common'

export interface ProcedureInput {
  procedureCode: string; procedureDisplay: string; performedAt: string; notes: string | null
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}

export function buildProcedure(i: ProcedureInput): object {
  return {
    resourceType: 'Procedure',
    status: 'completed',
    code: { coding: [{ system: FHIR.icd9cm, code: i.procedureCode, display: i.procedureDisplay }] },
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    performedDateTime: i.performedAt,
    performer: [{ actor: practitionerRef(i.practitionerIhs) }],
    ...(i.notes ? { note: [{ text: i.notes }] } : {}),
  }
}
