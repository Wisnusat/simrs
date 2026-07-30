import { episodeOfCareIdentifierSystem } from '../config'
import { patientRef, practitionerRef, orgRef } from './common'

const STATUS_MAP: Record<string, string> = {
  admitted: 'active',
  in_care: 'active',
  discharge_approved: 'active',
  discharged: 'finished',
  bpjs_finalized: 'finished',
}

export interface EpisodeOfCareInput {
  localId: string
  orgId: string
  status: string
  patientIhs: string
  patientName: string
  dpjpIhs: string
  dpjpName: string
  startDate: string
  endDate: string | null
}

export function buildEpisodeOfCare(input: EpisodeOfCareInput): object {
  return {
    resourceType: 'EpisodeOfCare',
    identifier: [{ system: episodeOfCareIdentifierSystem(input.orgId), value: input.localId }],
    status: STATUS_MAP[input.status] ?? 'active',
    patient: patientRef(input.patientIhs, input.patientName),
    managingOrganization: orgRef(input.orgId),
    period: {
      start: input.startDate,
      ...(input.endDate ? { end: input.endDate } : {}),
    },
    careManager: practitionerRef(input.dpjpIhs, input.dpjpName),
  }
}
