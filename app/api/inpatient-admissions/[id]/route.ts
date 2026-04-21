import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

/**
 * GET   /api/inpatient-admissions/[id] — full admission detail
 * PATCH /api/inpatient-admissions/[id] — update status, discharge, room transfer
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = rateLimit(req, 'admissions:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { id } = await params

  const { data, error } = await supabase
    .from('inpatient_admissions')
    .select(`
      *,
      patients ( id, full_name, medical_record_no, date_of_birth, gender, phone, bpjs_no, blood_type, address ),
      locations:room_location_id ( id, name, type, floor ),
      dpjp:practitioners!inpatient_admissions_dpjp_id_fkey ( id, full_name, role ),
      episodes_of_care ( id, diagnosis_primary, start_date, end_date, status )
    `)
    .eq('id', id)
    .single()

  if (error || !data) return apiResponse.notFound('Admission not found')
  return apiResponse.ok(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = rateLimit(req, 'admissions:patch', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const { id } = await params
  const body = await req.json()

  const allowedFields = [
    'status', 'discharge_summary', 'discharge_date',
    'room_location_id', 'bed_number', 'room_class',
  ]
  const update: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field]
  }

  // Auto-stamp discharge fields
  if (body.status === 'discharge_approved') {
    update.discharge_approved_by = practitioner.id
    update.discharge_approved_at = new Date().toISOString()
  }
  if (body.status === 'discharged' && !update.discharge_date) {
    update.discharge_date = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('inpatient_admissions')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)

  // If discharged, also close the episode
  if (body.status === 'discharged' && data) {
    const episodeId = (data as any).episode_of_care_id
    if (episodeId) {
      await supabase
        .from('episodes_of_care')
        .update({
          status: 'discharged',
          end_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', episodeId)
    }
  }

  return apiResponse.ok(data)
}
