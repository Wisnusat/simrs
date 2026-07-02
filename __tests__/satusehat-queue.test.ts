import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { enqueueSync } from '@/lib/satusehat/queue'
import { drainQueue, DeferSync, type SyncHandler } from '@/lib/satusehat/worker'
import { handlers } from '@/lib/satusehat/handlers'
import type { FhirClient } from '@/lib/satusehat/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

describe('ss_sync_queue table', () => {
  it('inserts and upserts a job on the unique key', async () => {
    const localId = crypto.randomUUID()
    const { error: e1 } = await supabase.from('ss_sync_queue').insert({
      resource_type: 'Encounter', local_id: localId, action: 'POST',
    })
    expect(e1).toBeNull()
    // duplicate enqueue must not error (upsert path used by enqueueSync)
    const { error: e2 } = await supabase.from('ss_sync_queue').upsert(
      { resource_type: 'Encounter', local_id: localId, action: 'POST', status: 'pending' },
      { onConflict: 'resource_type,local_id,action' },
    )
    expect(e2).toBeNull()
    const { data } = await supabase.from('ss_sync_queue')
      .select('*').eq('local_id', localId)
    expect(data).toHaveLength(1)
    expect(data![0].status).toBe('pending')
    expect(data![0].attempts).toBe(0)
    await supabase.from('ss_sync_queue').delete().eq('local_id', localId)
  })
})

const stubFhir: FhirClient = {
  get: async () => ({ ok: true, status: 200, body: {} }),
  post: async () => ({ ok: true, status: 201, body: { id: 'ss-test-id' } }),
  put: async () => ({ ok: true, status: 200, body: { id: 'ss-test-id' } }),
}

describe('worker drain', () => {
  it('runs handler and marks success', async () => {
    const localId = crypto.randomUUID()
    let handled = 0
    handlers['__Test'] = async () => { handled++ }
    await enqueueSync(supabase as any, '__Test' as any, localId)
    const result = await drainQueue(supabase as any, stubFhir)
    expect(handled).toBe(1)
    expect(result.succeeded).toBeGreaterThanOrEqual(1)
    const { data } = await supabase.from('ss_sync_queue').select('status').eq('local_id', localId).single()
    expect(data!.status).toBe('success')
    await supabase.from('ss_sync_queue').delete().eq('local_id', localId)
    delete handlers['__Test']
  })

  it('defers on DeferSync without burning an attempt', async () => {
    const localId = crypto.randomUUID()
    handlers['__Defer'] = async () => { throw new DeferSync('dep not ready') }
    await enqueueSync(supabase as any, '__Defer' as any, localId)
    await drainQueue(supabase as any, stubFhir)
    const { data } = await supabase.from('ss_sync_queue').select('status, attempts').eq('local_id', localId).single()
    expect(data!.status).toBe('pending')
    expect(data!.attempts).toBe(0)
    await supabase.from('ss_sync_queue').delete().eq('local_id', localId)
    delete handlers['__Defer']
  })

  it('backs off and eventually marks dead', async () => {
    const localId = crypto.randomUUID()
    handlers['__Fail'] = async () => { throw new Error('boom') }
    await enqueueSync(supabase as any, '__Fail' as any, localId)
    // force max_attempts=1 so a single drain kills it
    await supabase.from('ss_sync_queue').update({ max_attempts: 1 }).eq('local_id', localId)
    await drainQueue(supabase as any, stubFhir)
    const { data } = await supabase.from('ss_sync_queue').select('status, last_error').eq('local_id', localId).single()
    expect(data!.status).toBe('dead')
    expect(data!.last_error).toContain('boom')
    await supabase.from('ss_sync_queue').delete().eq('local_id', localId)
    delete handlers['__Fail']
  })
})
