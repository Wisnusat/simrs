import { FHIR, compositionIdentifierSystem } from '../config'
import { patientRef, practitionerRef, encounterRef, orgRef } from './common'

export interface CompositionInput {
  localId: string; orgId: string; resumeDate: string
  chiefComplaint: string | null; historyOfIllness: string | null
  physicalExamination: string | null; summary: string | null; followUpPlan: string | null
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function section(title: string, loinc: string, display: string, text: string | null) {
  if (!text) return null
  return {
    title,
    code: { coding: [{ system: FHIR.loinc, code: loinc, display }] },
    text: { status: 'additional', div: `<div xmlns="http://www.w3.org/1999/xhtml">${esc(text)}</div>` },
  }
}

export function buildComposition(i: CompositionInput): object {
  return {
    resourceType: 'Composition',
    identifier: { system: compositionIdentifierSystem(i.orgId), value: i.localId },
    status: 'final',
    type: { coding: [{ system: FHIR.loinc, code: '18842-5', display: 'Discharge summary' }] },
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    date: i.resumeDate,
    author: [practitionerRef(i.practitionerIhs)],
    title: 'Resume Medis',
    custodian: orgRef(i.orgId),
    section: [
      section('Keluhan Utama', '10154-3', 'Chief complaint', i.chiefComplaint),
      section('Riwayat Penyakit', '11348-0', 'History of past illness', i.historyOfIllness),
      section('Pemeriksaan Fisik', '29545-1', 'Physical findings', i.physicalExamination),
      section('Ringkasan', '51848-0', 'Evaluation note', i.summary),
      section('Rencana Tindak Lanjut', '18776-5', 'Plan of care', i.followUpPlan),
    ].filter(Boolean),
  }
}
