import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

/**
 * GET /api/lab-services
 * Returns the list of active lab services available for ordering.
 */
export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'lab-services:list', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { data, error } = await supabase
    .from('lab_services')
    .select('*')
    .eq('organization_id', auth.practitioner.organization_id)
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true })

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}
