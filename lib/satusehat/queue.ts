import { SupabaseClient } from '@supabase/supabase-js'

export type SsResourceType =
  | 'Patient' | 'Encounter' | 'Observation' | 'Condition' | 'AllergyIntolerance'
  | 'ClinicalImpression' | 'Medication' | 'MedicationRequest' | 'MedicationDispense'
  | 'Procedure' | 'Composition' | 'ServiceRequest' | 'DiagnosticReport'

/**
 * Enqueue an outbox job. Idempotent: re-enqueueing an existing
 * (resource_type, local_id, action) resets it to pending for immediate retry.
 * Never throws — a sync enqueue failure must not block the clinical workflow.
 */
export async function enqueueSync(
  supabase: SupabaseClient,
  resourceType: SsResourceType,
  localId: string,
  action: 'POST' | 'PUT' = 'POST',
): Promise<void> {
  try {
    await supabase.from('ss_sync_queue').upsert(
      {
        resource_type: resourceType,
        local_id: localId,
        action,
        status: 'pending',
        next_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'resource_type,local_id,action' },
    )
    kickWorker()
  } catch {
    // swallow — cron sweep will still pick nothing up if the insert failed,
    // but the clinical write must never fail because of sync plumbing
  }
}

/** Fire-and-forget poke so jobs run near-realtime instead of waiting for cron. */
export function kickWorker(): void {
  const base = process.env.BASE_URL
  const secret = process.env.CRON_SECRET
  if (!base || !secret) return
  fetch(`${base}/api/ss/worker`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => {})
}
