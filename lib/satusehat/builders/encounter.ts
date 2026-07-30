import { FHIR, encounterIdentifierSystem } from '../config'
import { patientRef, practitionerRef, orgRef } from './common'

const CLASS_MAP = {
  outpatient: { code: 'AMB', display: 'ambulatory' },
  inpatient: { code: 'IMP', display: 'inpatient encounter' },
  emergency: { code: 'EMER', display: 'emergency' },
  observation: { code: 'OBSENC', display: 'observation encounter' },
} as const

export interface EncounterInput {
  localId: string
  orgId: string
  encClass: keyof typeof CLASS_MAP
  status: 'arrived' | 'in_progress' | 'finished'
  patientIhs: string
  patientName: string
  practitionerIhs: string
  practitionerName: string
  ssLocationId: string
  locationName: string
  arrivedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  ssEpisodeOfCareId?: string
}

export function buildEncounter(input: EncounterInput): object {
  const cls = CLASS_MAP[input.encClass]

  // statusHistory: each phase ends when the next begins
  const history: object[] = []
  if (input.arrivedAt) {
    history.push({ status: 'arrived', period: { start: input.arrivedAt, ...(input.startedAt ? { end: input.startedAt } : {}) } })
  }
  if (input.startedAt) {
    history.push({ status: 'in-progress', period: { start: input.startedAt, ...(input.finishedAt ? { end: input.finishedAt } : {}) } })
  }
  if (input.finishedAt) {
    history.push({ status: 'finished', period: { start: input.finishedAt } })
  }

  const periodStart = input.arrivedAt ?? input.startedAt ?? undefined

  return {
    resourceType: 'Encounter',
    identifier: [{ system: encounterIdentifierSystem(input.orgId), value: input.localId }],
    status: input.status === 'in_progress' ? 'in-progress' : input.status,
    class: { system: FHIR.actCode, code: cls.code, display: cls.display },
    subject: patientRef(input.patientIhs, input.patientName),
    participant: [{
      type: [{ coding: [{ system: FHIR.participationType, code: 'ATND', display: 'attender' }] }],
      individual: practitionerRef(input.practitionerIhs, input.practitionerName),
    }],
    ...(periodStart ? { period: { start: periodStart, ...(input.finishedAt ? { end: input.finishedAt } : {}) } } : {}),
    location: [{ location: { reference: `Location/${input.ssLocationId}`, display: input.locationName } }],
    ...(history.length ? { statusHistory: history } : {}),
    ...(input.ssEpisodeOfCareId ? { episodeOfCare: [{ reference: `EpisodeOfCare/${input.ssEpisodeOfCareId}` }] } : {}),
    serviceProvider: orgRef(input.orgId),
  }
}
