import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

/**
 * GET /api/practitioners
 * List practitioners, optionally filtered by role.
 * Query: ?role=doctor|nurse|...
 */
export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'practitioners:list', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { searchParams } = new URL(req.url)
  const role = searchParams.get('role')

  let query = supabase
    .from('practitioners')
    .select('id, full_name, role, organization_id')
    .order('full_name')

  if (role) {
    query = query.eq('role', role)
  }

  const { data, error } = await query
  if (error) return apiResponse.serverError(error.message)

  return apiResponse.ok(data)
}
