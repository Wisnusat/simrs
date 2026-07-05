import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'
import { getVClaimClient } from '@/lib/bpjs/vclaim'

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, 'bpjs-eligibility:post', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { bpjs_no, service_date } = await req.json()
  if (!bpjs_no) return apiResponse.badRequest('bpjs_no wajib diisi')

  const result = await getVClaimClient().checkEligibility(
    String(bpjs_no),
    service_date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }),
  )
  return apiResponse.ok(result)
}
