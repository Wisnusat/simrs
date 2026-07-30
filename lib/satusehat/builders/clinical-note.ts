import { patientRef, practitionerRef, encounterRef } from './common'

export interface ClinicalNoteInput {
  subjective: string | null; objective: string | null; assessment: string | null; plan: string | null
  noteDate: string
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}

export function buildClinicalImpression(i: ClinicalNoteInput): object {
  const summary = [
    i.subjective ? `S: ${i.subjective}` : null,
    i.objective ? `O: ${i.objective}` : null,
    i.assessment ? `A: ${i.assessment}` : null,
    i.plan ? `P: ${i.plan}` : null,
  ].filter(Boolean).join('\n')

  return {
    resourceType: 'ClinicalImpression',
    status: 'completed',
    description: 'Catatan SOAP',
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    effectiveDateTime: i.noteDate,
    date: i.noteDate,
    assessor: practitionerRef(i.practitionerIhs),
    summary,
  }
}
