import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { realFhirClient } from '@/lib/satusehat/client'

export interface SsOrganization {
  id: string
  name: string
  type: string | null
  city: string | null
}

/**
 * GET /api/satusehat/organizations?name=<q>
 * Proxy to SATUSEHAT GET /Organization?name=<q>&_count=10
 * Returns normalized list for the referral destination search dropdown.
 */
export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'ss-org-search:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const q = new URL(req.url).searchParams.get('name')?.trim()
  if (!q || q.length < 3) return apiResponse.badRequest('name minimum 3 karakter')

  try {
    const res = await realFhirClient.get(`/Organization?name=${encodeURIComponent(q)}&_count=10&active=true`)
    if (!res.ok) return apiResponse.serverError(`SATUSEHAT error ${res.status}`)

    const entries: any[] = res.body?.entry ?? []
    const results: SsOrganization[] = entries.map((e) => {
      const r = e.resource
      const city =
        r.address?.[0]?.city ??
        r.address?.[0]?.district ??
        null
      return {
        id: r.id,
        name: r.name ?? '—',
        type: r.type?.[0]?.coding?.[0]?.display ?? null,
        city,
      }
    })

    return apiResponse.ok(results)
  } catch (err: any) {
    return apiResponse.serverError(err.message)
  }
}
