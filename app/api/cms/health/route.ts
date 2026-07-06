import { NextRequest } from 'next/server'
import { Redis } from '@upstash/redis'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'

const SS_BASE = process.env.SATUSEHAT_BASE_URL ?? 'https://api-satusehat-stg.dto.kemkes.go.id'

export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'cms:health', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (isGuardError(auth)) return auth

  const checks = await Promise.allSettled([
    checkSupabase(),
    checkRedis(),
    checkSatuSehat(),
  ])

  return apiResponse.ok({
    supabase: settled(checks[0]),
    redis: settled(checks[1]),
    satusehat: settled(checks[2]),
    checkedAt: new Date().toISOString(),
  })
}

type CheckResult = { status: 'ok' | 'error'; latencyMs: number; detail?: string }

function settled(r: PromiseSettledResult<CheckResult>): CheckResult {
  if (r.status === 'fulfilled') return r.value
  return { status: 'error', latencyMs: 0, detail: String(r.reason?.message ?? r.reason) }
}

async function checkSupabase(): Promise<CheckResult> {
  const t = Date.now()
  const admin = createAdminClient()
  const { error } = await admin.from('organizations').select('id').limit(1)
  return error
    ? { status: 'error', latencyMs: Date.now() - t, detail: error.message }
    : { status: 'ok', latencyMs: Date.now() - t }
}

async function checkRedis(): Promise<CheckResult> {
  const t = Date.now()
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
  await redis.ping()
  return { status: 'ok', latencyMs: Date.now() - t }
}

async function checkSatuSehat(): Promise<CheckResult> {
  const t = Date.now()
  const res = await fetch(`${SS_BASE}/healthcheck`, {
    method: 'GET',
    signal: AbortSignal.timeout(5000),
  }).catch(() => fetch(SS_BASE, { method: 'HEAD', signal: AbortSignal.timeout(5000) }))
  const latencyMs = Date.now() - t
  const ok = res.status < 500
  return { status: ok ? 'ok' : 'error', latencyMs, detail: `HTTP ${res.status}` }
}
