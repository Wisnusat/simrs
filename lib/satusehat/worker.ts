import * as Sentry from '@sentry/nextjs'
import { SupabaseClient } from '@supabase/supabase-js'
import type { FhirClient } from './client'
import { handlers } from './handlers'

/** Throw from a handler when a dependency (e.g. patient IHS) isn't synced yet. */
export class DeferSync extends Error {}

export interface SyncJob {
  id: string
  resource_type: string
  local_id: string
  action: string
  attempts: number
  max_attempts: number
}

export type SyncHandler = (supabase: SupabaseClient, fhir: FhirClient, job: SyncJob) => Promise<void>

const DEFER_DELAY_MS = 60_000

function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts, 60) * 60_000 // 2,4,8,…60 minutes
}

const STALE_PROCESSING_MS = 10 * 60 * 1000 // 10 min — safe above Vercel 300s timeout

async function recoverStaleJobs(supabase: SupabaseClient) {
  const threshold = new Date(Date.now() - STALE_PROCESSING_MS).toISOString()
  await supabase.from('ss_sync_queue')
    .update({
      status: 'pending',
      last_error: 'Recovered: worker timeout (stuck in processing)',
      next_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'processing')
    .lt('updated_at', threshold)
}

export async function drainQueue(supabase: SupabaseClient, fhir: FhirClient, limit = 20) {
  await recoverStaleJobs(supabase)
  const { data: jobs, error } = await supabase.rpc('claim_ss_sync_jobs', { p_limit: limit })
  if (error) throw new Error(`claim_ss_sync_jobs failed: ${error.message}`)

  const stats = { processed: 0, succeeded: 0, deferred: 0, failed: 0 }

  for (const job of (jobs ?? []) as SyncJob[]) {
    stats.processed++
    const handler = handlers[job.resource_type]
    try {
      if (!handler) throw new Error(`no handler for resource_type ${job.resource_type}`)
      await handler(supabase, fhir, job)
      await supabase.from('ss_sync_queue')
        .update({ status: 'success', updated_at: new Date().toISOString() })
        .eq('id', job.id)
      stats.succeeded++
    } catch (e: any) {
      if (e instanceof DeferSync) {
        // dependency not ready — retry soon, don't count as failure
        // relies on claim_ss_sync_jobs not incrementing attempts at claim time
        await supabase.from('ss_sync_queue').update({
          status: 'pending',
          next_attempt_at: new Date(Date.now() + DEFER_DELAY_MS).toISOString(),
          last_error: `deferred: ${e.message}`,
          updated_at: new Date().toISOString(),
        }).eq('id', job.id)
        stats.deferred++
        continue
      }
      const attempts = job.attempts + 1
      const dead = attempts >= job.max_attempts
      await supabase.from('ss_sync_queue').update({
        status: dead ? 'dead' : 'failed',
        attempts,
        next_attempt_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
        last_error: String(e?.message ?? e).slice(0, 2000),
        updated_at: new Date().toISOString(),
      }).eq('id', job.id)
      Sentry.withScope((scope) => {
        scope.setTag('satusehat.resource_type', job.resource_type)
        scope.setTag('satusehat.action', job.action)
        scope.setTag('satusehat.dead', String(dead))
        scope.setContext('job', { id: job.id, local_id: job.local_id, attempts })
        Sentry.captureException(e)
      })
      stats.failed++
    }
  }
  return stats
}
