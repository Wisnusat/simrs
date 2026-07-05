import type { SyncHandler } from '../worker'
import { patientHandler } from './patient'
import { encounterHandler } from './encounter'

// Populated by later tasks (encounter, observation, …). Mutable so tests can
// register throwaway handlers.
export const handlers: Record<string, SyncHandler> = {
  Patient: patientHandler,
  Encounter: encounterHandler,
}
