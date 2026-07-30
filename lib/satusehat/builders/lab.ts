import { FHIR, serviceRequestIdentifierSystem, diagnosticReportIdentifierSystem } from '../config'
import { patientRef, practitionerRef, encounterRef } from './common'

export interface ServiceRequestInput {
  localId: string; orgId: string; orderDate: string
  items: Array<{ loincCode: string | null; testName: string }>
  clinicalNotes: string | null
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}

export function buildServiceRequest(i: ServiceRequestInput): object {
  const primary = i.items[0]
  return {
    resourceType: 'ServiceRequest',
    identifier: [{ system: serviceRequestIdentifierSystem(i.orgId), value: i.localId }],
    status: 'active',
    intent: 'original-order',
    priority: 'routine',
    category: [{ coding: [{ system: 'http://snomed.info/sct', code: '108252007', display: 'Laboratory procedure' }] }],
    code: primary?.loincCode
      ? { coding: [{ system: FHIR.loinc, code: primary.loincCode, display: primary.testName }], text: i.items.map(x => x.testName).join(', ') }
      : { text: i.items.map(x => x.testName).join(', ') },
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    occurrenceDateTime: i.orderDate,
    authoredOn: i.orderDate,
    requester: practitionerRef(i.practitionerIhs),
    ...(i.clinicalNotes ? { note: [{ text: i.clinicalNotes }] } : {}),
  }
}

export interface DiagnosticReportInput {
  localId: string; orgId: string; effective: string; ssServiceRequestId: string
  results: Array<{ testName: string; value: string | null; unit: string | null; referenceRange: string | null }>
  patientIhs: string; patientName: string; ssEncounterId: string
}

export function buildDiagnosticReport(i: DiagnosticReportInput): object {
  const conclusion = i.results
    .map(r => `${r.testName}: ${r.value ?? '-'}${r.unit ? ` ${r.unit}` : ''}${r.referenceRange ? ` (ref: ${r.referenceRange})` : ''}`)
    .join('\n')
  return {
    resourceType: 'DiagnosticReport',
    identifier: [{ system: diagnosticReportIdentifierSystem(i.orgId), value: i.localId }],
    basedOn: [{ reference: `ServiceRequest/${i.ssServiceRequestId}` }],
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
    code: { text: i.results.map(r => r.testName).join(', ') },
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    effectiveDateTime: i.effective,
    issued: i.effective,
    conclusion,
  }
}
