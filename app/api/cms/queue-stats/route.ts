import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'

export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'cms:queue-stats', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (isGuardError(auth)) return auth

  const admin = createAdminClient()

  const [countsRes, recentRes] = await Promise.all([
    admin.from('ss_sync_queue')
      .select('status')
      .then(({ data, error }) => {
        if (error) throw error
        const counts: Record<string, number> = { pending: 0, processing: 0, success: 0, failed: 0, dead: 0 }
        for (const row of data ?? []) counts[row.status] = (counts[row.status] ?? 0) + 1
        return counts
      }),
    admin.from('ss_sync_queue')
      .select('id, resource_type, local_id, action, attempts, max_attempts, last_error, status, updated_at')
      .in('status', ['failed', 'dead'])
      .order('updated_at', { ascending: false })
      .limit(10),
  ])

  return apiResponse.ok({
    counts: countsRes,
    recentFailures: recentRes.data ?? [],
  })
}
