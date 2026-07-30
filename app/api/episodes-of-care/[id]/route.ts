import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { enqueueSync } from '@/lib/satusehat/queue'

/**
 * GET /api/episodes-of-care/[id]   — full episode detail
 * PATCH /api/episodes-of-care/[id] — update status, room, end_date
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await rateLimit(req, 'episodes:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { id } = await params

  const { data, error } = await supabase
    .from('episodes_of_care')
    .select(`
      *,
      patients ( id, full_name, medical_record_no, date_of_birth, gender, phone, bpjs_no, blood_type, address ),
      locations:room_location_id ( id, name, type, floor ),
      dpjp:practitioners!episodes_of_care_dpjp_id_fkey ( id, full_name, role )
    `)
    .eq('id', id)
    .single()

  if (error || !data) return apiResponse.notFound('Episode not found')
  return apiResponse.ok(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await rateLimit(req, 'episodes:patch', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { id } = await params
  const body = await req.json()

  const allowedFields = ['status', 'end_date', 'room_location_id', 'bed_number', 'diagnosis_primary', 'dpjp_id']
  const update: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field]
  }

  if (body.status === 'discharged' && !update.end_date) {
    update.end_date = new Date().toISOString().split('T')[0]
  }

  const { data, error } = await supabase
    .from('episodes_of_care')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)
  enqueueSync(supabase, 'EpisodeOfCare', id).catch(() => {})
  return apiResponse.ok(data)
}
