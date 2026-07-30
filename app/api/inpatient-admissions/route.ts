import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { enqueueSync } from '@/lib/satusehat/queue'

/**
 * GET  /api/inpatient-admissions — list active admissions
 * POST /api/inpatient-admissions — create new admission
 */
export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'admissions:list', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const dpjpId = searchParams.get('dpjp_id')

  let query = supabase
    .from('inpatient_admissions')
    .select(`
      *,
      patients ( full_name, medical_record_no, date_of_birth, gender, phone, bpjs_no ),
      locations:room_location_id ( id, name, type, floor ),
      dpjp:practitioners!inpatient_admissions_dpjp_id_fkey ( full_name, role ),
      episodes_of_care ( id, diagnosis_primary, start_date )
    `)
    .order('admission_date', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  } else {
    // Default: show active admissions only
    query = query.in('status', ['admitted', 'in_care', 'discharge_approved'])
  }
  if (dpjpId) query = query.eq('dpjp_id', dpjpId)

  const { data, error } = await query.limit(200)
  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, 'admissions:create', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const body = await req.json()
  const {
    episode_of_care_id, patient_id,
    room_location_id, bed_number, room_class,
    dpjp_id, admitted_from,
  } = body

  if (!episode_of_care_id || !patient_id || !room_location_id || !bed_number || !dpjp_id) {
    return apiResponse.badRequest('episode_of_care_id, patient_id, room_location_id, bed_number, and dpjp_id are required')
  }

  // Resolve __self__ to current practitioner
  const { practitioner } = auth
  const resolvedDpjpId = dpjp_id === '__self__' ? practitioner.id : dpjp_id

  const { data, error } = await supabase
    .from('inpatient_admissions')
    .insert({
      episode_of_care_id,
      patient_id,
      room_location_id,
      bed_number,
      room_class: room_class ?? 'kelas_3',
      dpjp_id: resolvedDpjpId,
      admitted_from: admitted_from ?? 'outpatient',
      status: 'admitted',
      admission_date: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)
  // Re-enqueue episode so room assignment is reflected in SATUSEHAT
  enqueueSync(supabase, 'EpisodeOfCare', episode_of_care_id).catch(() => {})
  return apiResponse.created(data)
}
