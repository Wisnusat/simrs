import type { SyncHandler } from '../worker'

// Populated by later tasks (encounter, observation, …). Mutable so tests can
// register throwaway handlers.
export const handlers: Record<string, SyncHandler> = {}
