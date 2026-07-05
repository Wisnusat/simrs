import type { SyncHandler } from '../worker'
import { patientHandler } from './patient'
import { encounterHandler } from './encounter'
import { observationHandler } from './observation'
import { conditionHandler } from './condition'
import { allergyHandler } from './allergy'

export const handlers: Record<string, SyncHandler> = {
  Patient: patientHandler,
  Encounter: encounterHandler,
  Observation: observationHandler,
  Condition: conditionHandler,
  AllergyIntolerance: allergyHandler,
}
