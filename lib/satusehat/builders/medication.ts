import { FHIR, prescriptionIdentifierSystem, prescriptionItemIdentifierSystem } from '../config'
import { patientRef, practitionerRef, encounterRef } from './common'

export interface MedicationData {
  localId: string
  kfaCode: string | null
  name: string
}

function buildContainedMedication(med: MedicationData): object {
  return {
    resourceType: 'Medication',
    id: 'med-contained',
    meta: { profile: ['https://fhir.kemkes.go.id/r4/StructureDefinition/Medication'] },
    code: med.kfaCode
      ? { coding: [{ system: FHIR.kfa, code: med.kfaCode, display: med.name }] }
      : { text: med.name },
    extension: [{
      url: 'https://fhir.kemkes.go.id/r4/StructureDefinition/MedicationType',
      valueCodeableConcept: {
        coding: [{ system: 'http://terminology.kemkes.go.id/CodeSystem/medication-type', code: 'NC', display: 'Non-compound' }],
      },
    }],
  }
}

export function buildMedicationRequest(i: {
  prescriptionId: string
  itemId: string
  orgId: string
  medication: MedicationData
  dosage: string | null
  frequency: string | null
  instructions: string | null
  authoredOn: string
  patientIhs: string
  patientName: string
  practitionerIhs: string
  ssEncounterId: string
}): object {
  return {
    resourceType: 'MedicationRequest',
    contained: [buildContainedMedication(i.medication)],
    identifier: [
      { use: 'official', system: prescriptionIdentifierSystem(i.orgId), value: i.prescriptionId },
      { use: 'official', system: prescriptionItemIdentifierSystem(i.orgId), value: i.itemId },
    ],
    status: 'active',
    intent: 'order',
    medicationReference: { reference: '#med-contained', display: i.medication.name },
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    authoredOn: i.authoredOn,
    requester: practitionerRef(i.practitionerIhs),
    dosageInstruction: [{
      text: [i.dosage, i.frequency].filter(Boolean).join(' '),
      ...(i.instructions ? { patientInstruction: i.instructions } : {}),
    }],
  }
}

export function buildMedicationDispense(i: {
  localId: string
  orgId: string
  medication: MedicationData
  ssMedicationRequestId: string
  quantity: number
  whenHandedOver: string
  patientIhs: string
  patientName: string
  practitionerIhs: string
  ssEncounterId: string
}): object {
  return {
    resourceType: 'MedicationDispense',
    contained: [buildContainedMedication(i.medication)],
    identifier: [{ use: 'official', system: `http://sys-ids.kemkes.go.id/dispense/${i.orgId}`, value: i.localId }],
    status: 'completed',
    medicationReference: { reference: '#med-contained', display: i.medication.name },
    subject: patientRef(i.patientIhs, i.patientName),
    context: encounterRef(i.ssEncounterId),
    performer: [{ actor: practitionerRef(i.practitionerIhs) }],
    authorizingPrescription: [{ reference: `MedicationRequest/${i.ssMedicationRequestId}` }],
    quantity: { value: i.quantity },
    whenHandedOver: i.whenHandedOver,
  }
}
