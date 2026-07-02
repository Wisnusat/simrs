import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

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
