import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

/**
 * GET /api/surgery-requests
 * Lists all surgery requests with patient, requested_by, surgeon, anesthesiologist, and location joins.
 * Supports status/patient filtering.
 */
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, 'surgery:list', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const patientId = searchParams.get('patient_id')

  let query = supabase
    .from('surgery_requests')
    .select(`
      *,
      patients:patient_id ( id, full_name, medical_record_no, gender, date_of_birth, phone ),
      doctor:requested_by ( id, full_name, role ),
      surgeon:surgeon_id ( id, full_name, role ),
      anesthesiologist:anesthesiologist_id ( id, full_name, role ),
      locations:ok_location_id ( id, name, type, floor )
    `)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }
  if (patientId) {
    query = query.eq('patient_id', patientId)
  }

  const { data, error } = await query.limit(200)
  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}

/**
 * POST /api/surgery-requests
 * Creates a new surgery request.
 * Body: { patient_id, encounter_id, episode_of_care_id?, surgery_type, indication, anesthesia_type?, needs_inpatient_after? }
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, 'surgery:create', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const body = await req.json()
  const {
    patient_id,
    encounter_id,
    episode_of_care_id,
    surgery_type,
    indication,
    anesthesia_type,
    needs_inpatient_after,
  } = body

  if (!patient_id || !encounter_id || !surgery_type || !indication) {
    return apiResponse.badRequest('patient_id, encounter_id, surgery_type, and indication are required')
  }

  const { data, error } = await supabase
    .from('surgery_requests')
    .insert({
      patient_id,
      encounter_id,
      episode_of_care_id: episode_of_care_id || null,
      requested_by: practitioner.id,
      surgery_type,
      indication,
      anesthesia_type: anesthesia_type || null,
      needs_inpatient_after: needs_inpatient_after ?? false,
      status: 'surgery_requested',
    })
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.created(data)
}
