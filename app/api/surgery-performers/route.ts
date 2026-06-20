import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'surgery-performers:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const surgery_request_id = new URL(req.url).searchParams.get('surgery_request_id')
  if (!surgery_request_id) return apiResponse.badRequest('surgery_request_id required')

  const { data, error } = await supabase
    .from('surgery_performers')
    .select('*')
    .eq('surgery_request_id', surgery_request_id)
    .order('sort_order')

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}

export async function PUT(req: NextRequest) {
  const rl = await rateLimit(req, 'surgery-performers:put', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const body = await req.json()
  const { surgery_request_id, performers } = body

  if (!surgery_request_id || !Array.isArray(performers)) {
    return apiResponse.badRequest('surgery_request_id and performers[] required')
  }

  // Delete + re-insert for clean upsert semantics
  const { error: delError } = await supabase
    .from('surgery_performers')
    .delete()
    .eq('surgery_request_id', surgery_request_id)

  if (delError) return apiResponse.serverError(delError.message)

  if (performers.length > 0) {
    const rows = performers.map((p: any, i: number) => ({
      surgery_request_id,
      practitioner_id: p.practitioner_id || null,
      display_name: p.display_name,
      role: p.role,
      snomed_role_code: p.snomed_role_code || null,
      snomed_role_display: p.snomed_role_display || null,
      pre_op_notes: p.pre_op_notes || null,
      post_op_notes: p.post_op_notes || null,
      sort_order: p.sort_order ?? i,
    }))
    const { error: insError } = await supabase.from('surgery_performers').insert(rows)
    if (insError) return apiResponse.serverError(insError.message)
  }

  const { data } = await supabase
    .from('surgery_performers')
    .select('*')
    .eq('surgery_request_id', surgery_request_id)
    .order('sort_order')

  return apiResponse.ok(data)
}
