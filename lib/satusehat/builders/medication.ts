import { FHIR, medicationIdentifierSystem, prescriptionIdentifierSystem, prescriptionItemIdentifierSystem } from '../config'
import { patientRef, practitionerRef, encounterRef } from './common'

export function buildMedication(i: { localId: string; orgId: string; kfaCode: string | null; name: string }): object {
  return {
    resourceType: 'Medication',
    meta: { profile: ['https://fhir.kemkes.go.id/r4/StructureDefinition/Medication'] },
    identifier: [{ use: 'official', system: medicationIdentifierSystem(i.orgId), value: i.localId }],
    status: 'active',
    code: i.kfaCode
      ? { coding: [{ system: FHIR.kfa, code: i.kfaCode, display: i.name }] }
      : { text: i.name },
    extension: [{
      url: 'https://fhir.kemkes.go.id/r4/StructureDefinition/MedicationType',
      valueCodeableConcept: {
        coding: [{ system: 'http://terminology.kemkes.go.id/CodeSystem/medication-type', code: 'NC', display: 'Non-compound' }],
      },
    }],
  }
}

export function buildMedicationRequest(i: {
  prescriptionId: string; itemId: string; orgId: string
  ssMedicationId: string; medicationName: string
  dosage: string | null; frequency: string | null; instructions: string | null
  authoredOn: string
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}): object {
  return {
    resourceType: 'MedicationRequest',
    identifier: [
      { use: 'official', system: prescriptionIdentifierSystem(i.orgId), value: i.prescriptionId },
      { use: 'official', system: prescriptionItemIdentifierSystem(i.orgId), value: i.itemId },
    ],
    status: 'active',
    intent: 'order',
    medicationReference: { reference: `Medication/${i.ssMedicationId}`, display: i.medicationName },
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
  localId: string; orgId: string
  ssMedicationId: string; medicationName: string; ssMedicationRequestId: string
  quantity: number; whenHandedOver: string
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}): object {
  return {
    resourceType: 'MedicationDispense',
    identifier: [{ use: 'official', system: `http://sys-ids.kemkes.go.id/dispense/${i.orgId}`, value: i.localId }],
    status: 'completed',
    medicationReference: { reference: `Medication/${i.ssMedicationId}`, display: i.medicationName },
    subject: patientRef(i.patientIhs, i.patientName),
    context: encounterRef(i.ssEncounterId),
    performer: [{ actor: practitionerRef(i.practitionerIhs) }],
    authorizingPrescription: [{ reference: `MedicationRequest/${i.ssMedicationRequestId}` }],
    quantity: { value: i.quantity },
    whenHandedOver: i.whenHandedOver,
  }
}
