import { FHIR } from '../config'
import { patientRef, encounterRef } from './common'

export interface AllergyInput {
  substanceDisplay: string
  category: 'medication' | 'food' | 'environment'
  criticality: 'low' | 'high' | 'unable-to-assess'
  reactionDescription: string | null
  onsetDate: string | null
  isActive: boolean
  patientIhs: string; patientName: string; ssEncounterId: string | null
}

export function buildAllergy(i: AllergyInput): object {
  return {
    resourceType: 'AllergyIntolerance',
    clinicalStatus: { coding: [{ system: FHIR.allergyClinical, code: i.isActive ? 'active' : 'inactive' }] },
    verificationStatus: { coding: [{ system: FHIR.allergyVerification, code: 'confirmed' }] },
    category: [i.category],
    criticality: i.criticality,
    code: { text: i.substanceDisplay },
    patient: patientRef(i.patientIhs, i.patientName),
    ...(i.ssEncounterId ? { encounter: encounterRef(i.ssEncounterId) } : {}),
    ...(i.onsetDate ? { onsetDateTime: i.onsetDate } : {}),
    ...(i.reactionDescription ? { reaction: [{ manifestation: [{ text: i.reactionDescription }] }] } : {}),
  }
}
