import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'
import { drainQueue } from '@/lib/satusehat/worker'
import { realFhirClient } from '@/lib/satusehat/client'

export const maxDuration = 60

type Action = 'trigger_worker' | 'retry_failed' | 'reset_stuck'

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, 'cms:queue-actions', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (isGuardError(auth)) return auth

  const { action } = (await req.json()) as { action: Action }
  const admin = createAdminClient()

  if (action === 'trigger_worker') {
    const stats = await drainQueue(admin, realFhirClient)
    return apiResponse.ok({ action, stats })
  }

  if (action === 'retry_failed') {
    const { error, count } = await admin.from('ss_sync_queue')
      .update({ status: 'pending', attempts: 0, next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('status', 'failed')
    if (error) return apiResponse.serverError(error.message)
    return apiResponse.ok({ action, reset: count })
  }

  if (action === 'reset_stuck') {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { error, count } = await admin.from('ss_sync_queue')
      .update({ status: 'pending', next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('status', 'processing')
      .lt('updated_at', cutoff)
    if (error) return apiResponse.serverError(error.message)
    return apiResponse.ok({ action, reset: count })
  }

  return apiResponse.badRequest('Unknown action')
}
