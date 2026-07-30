import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'

const SS_BASE = process.env.SATUSEHAT_BASE_URL ?? 'https://api-satusehat-stg.dto.kemkes.go.id'

// In-memory cache — shared across requests on the same Vercel instance.
// Prevents spamming Supabase/Redis/SATUSEHAT on every 60-second UI refresh.
const CACHE_TTL_MS = 60_000
let cache: { data: object; expiresAt: number } | null = null

export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'cms:health', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (isGuardError(auth)) return auth

  // Return cached result if still fresh
  if (cache && cache.expiresAt > Date.now()) {
    return apiResponse.ok(cache.data)
  }

  const checks = await Promise.allSettled([
    checkSupabase(),
    checkRedis(),
    checkSatuSehat(),
  ])

  const data = {
    supabase: settled(checks[0]),
    redis: settled(checks[1]),
    satusehat: settled(checks[2]),
    checkedAt: new Date().toISOString(),
  }

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS }
  return apiResponse.ok(data)
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

// Redis check: hit Upstash root URL — any HTTP response means endpoint reachable.
// Does NOT execute a Redis command, so free-tier command quota (10k/day) is preserved.
// /ping would count as a command; root GET with bad path returns 4xx but no command.
async function checkRedis(): Promise<CheckResult> {
  const t = Date.now()
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return { status: 'error', latencyMs: 0, detail: 'env missing' }
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(4000),
  })
  const latencyMs = Date.now() - t
  // Upstash returns 200 or 4xx for root path — anything <500 means endpoint is up
  return res.status < 500
    ? { status: 'ok', latencyMs }
    : { status: 'error', latencyMs, detail: `HTTP ${res.status}` }
}

async function checkSatuSehat(): Promise<CheckResult> {
  const t = Date.now()
  const res = await fetch(`${SS_BASE}/healthcheck`, {
    method: 'GET',
    signal: AbortSignal.timeout(5000),
  }).catch(() => fetch(SS_BASE, { method: 'HEAD', signal: AbortSignal.timeout(5000) }))
  const latencyMs = Date.now() - t
  return { status: res.status < 500 ? 'ok' : 'error', latencyMs, detail: `HTTP ${res.status}` }
}
