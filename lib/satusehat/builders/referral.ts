import { serviceRequestIdentifierSystem } from '../config'
import { patientRef, practitionerRef, encounterRef } from './common'

const SNOMED = 'http://snomed.info/sct'

export function buildReferralServiceRequest(i: {
  localId: string
  orgId: string
  referralDate: string
  urgency: string
  destinationFacilityName: string
  destinationSpecialty: string | null
  referralReason: string
  ssDestinationOrgId: string | null
  patientIhs: string
  patientName: string
  practitionerIhs: string
  ssEncounterId: string
}): object {
  return {
    resourceType: 'ServiceRequest',
    identifier: [{ system: serviceRequestIdentifierSystem(i.orgId), value: `referral-${i.localId}` }],
    status: 'active',
    intent: 'refer',
    priority: i.urgency === 'emergency' ? 'stat' : i.urgency === 'urgent' ? 'urgent' : 'routine',
    category: [{
      coding: [{ system: SNOMED, code: '306206005', display: 'Referral to hospital' }],
    }],
    code: {
      coding: i.destinationSpecialty
        ? [{ system: SNOMED, code: '3457005', display: i.destinationSpecialty }]
        : undefined,
      text: [i.destinationFacilityName, i.destinationSpecialty].filter(Boolean).join(' — '),
    },
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    authoredOn: i.referralDate,
    requester: practitionerRef(i.practitionerIhs),
    ...(i.ssDestinationOrgId
      ? { performer: [{ reference: `Organization/${i.ssDestinationOrgId}` }] }
      : {}),
    reasonCode: [{ text: i.referralReason }],
  }
}
