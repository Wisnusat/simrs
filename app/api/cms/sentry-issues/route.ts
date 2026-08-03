import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'

const SENTRY_ORG = 'ursatrioo'
const SENTRY_PROJECT = 'javascript-nextjs'

export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'cms:sentry', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (isGuardError(auth)) return auth

  const token = process.env.SENTRY_AUTH_TOKEN
  if (!token) return apiResponse.ok({ issues: [], unavailable: true })

  const url = `https://sentry.io/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/` +
    `?query=is:unresolved&limit=10&statsPeriod=7d&sort=date`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  })

  if (!res.ok) {
    return apiResponse.ok({ issues: [], error: `Sentry HTTP ${res.status}` })
  }

  const raw = await res.json() as Array<{
    id: string
    title: string
    culprit: string
    count: string
    lastSeen: string
    level: string
    permalink: string
    tags: Array<{ key: string; name: string }>
  }>

  const issues = raw.map(i => ({
    id: i.id,
    title: i.title,
    culprit: i.culprit,
    count: Number(i.count),
    lastSeen: i.lastSeen,
    level: i.level,
    permalink: i.permalink,
  }))

  return apiResponse.ok({ issues })
}
