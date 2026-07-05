import type { SyncHandler } from '../worker'
import { patientHandler } from './patient'
import { encounterHandler } from './encounter'
import { observationHandler } from './observation'
import { conditionHandler } from './condition'
import { allergyHandler } from './allergy'
import { clinicalNoteHandler } from './clinical-note'
import { medicationRequestHandler, medicationDispenseHandler } from './medication'
import { compositionHandler } from './composition'
import { procedureHandler } from './procedure'
import { serviceRequestHandler, diagnosticReportHandler } from './lab'

export const handlers: Record<string, SyncHandler> = {
  Patient: patientHandler,
  Encounter: encounterHandler,
  Observation: observationHandler,
  Condition: conditionHandler,
  AllergyIntolerance: allergyHandler,
  ClinicalImpression: clinicalNoteHandler,
  MedicationRequest: medicationRequestHandler,
  MedicationDispense: medicationDispenseHandler,
  Composition: compositionHandler,
  Procedure: procedureHandler,
  ServiceRequest: serviceRequestHandler,
  DiagnosticReport: diagnosticReportHandler,
}
