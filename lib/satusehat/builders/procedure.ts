import { FHIR } from '../config'
import { patientRef, practitionerRef, encounterRef } from './common'

const SNOMED = 'http://snomed.info/sct'

export interface SurgeryPerformer {
  ihs: string
  name?: string
  snomedCode?: string | null
  snomedDisplay?: string | null
}

export interface ProcedureInput {
  procedureCode: string
  procedureDisplay: string
  performedAt: string
  performedEnd?: string | null
  notes: string | null
  patientIhs: string
  patientName: string
  /** Used only for non-surgery (single performer) path */
  practitionerIhs?: string
  ssEncounterId: string
  /** Surgery path: full team from surgery_performers */
  performers?: SurgeryPerformer[]
}

export function buildProcedure(i: ProcedureInput): object {
  // Performer array — surgery has many, non-surgery has one
  const performerList: object[] = i.performers?.length
    ? i.performers.map((p) => ({
        ...(p.snomedCode ? {
          function: { coding: [{ system: SNOMED, code: p.snomedCode, display: p.snomedDisplay ?? p.snomedCode }] },
        } : {}),
        actor: practitionerRef(p.ihs, p.name),
      }))
    : [{ actor: practitionerRef(i.practitionerIhs!) }]

  // Period vs point-in-time
  const performed = (i.performedEnd)
    ? { performedPeriod: { start: i.performedAt, end: i.performedEnd } }
    : { performedDateTime: i.performedAt }

  return {
    resourceType: 'Procedure',
    status: 'completed',
    code: {
      coding: [{ system: FHIR.icd9cm, code: i.procedureCode, display: i.procedureDisplay }],
      text: i.procedureDisplay,
    },
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    ...performed,
    performer: performerList,
    ...(i.notes ? { note: [{ text: i.notes }] } : {}),
  }
}
