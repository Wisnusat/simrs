import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

/**
 * GET  /api/admission-requests — list pending admissions (episodes of care without a room)
 * POST /api/admission-requests — fulfill request by assigning room/bed and creating inpatient_admissions
 */
export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'admission-requests:list', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  // Pending requests are episodes of care with status admitted but no room assigned
  const { data, error } = await supabase
    .from('episodes_of_care')
    .select(`
      *,
      patients ( full_name, medical_record_no, date_of_birth, gender ),
      dpjp:practitioners!episodes_of_care_dpjp_id_fkey ( full_name, role )
    `)
    .eq('organization_id', auth.practitioner.organization_id)
    .is('room_location_id', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return apiResponse.serverError(error.message)

  // Annotate each episode with source (igd vs poli) — single query, no N+1
  const patientIds = (data ?? []).map((ep: any) => ep.patient_id)
  let igdSet = new Set<string>()

  if (patientIds.length > 0) {
    const { data: igdRows } = await supabase
      .from('emergency_encounters')
      .select('patient_id')
      .in('patient_id', patientIds)
      .eq('status', 'admitted_to_inpatient')

    igdSet = new Set((igdRows ?? []).map((r: any) => r.patient_id))
  }

  const annotated = (data ?? []).map((ep: any) => ({
    ...ep,
    source: igdSet.has(ep.patient_id) ? 'igd' : 'poli',
  }))

  return apiResponse.ok(annotated)
}

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, 'admission-requests:create', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const body = await req.json()
  const {
    episode_of_care_id,
    room_location_id,
    bed_number,
    room_class,
  } = body

  if (!episode_of_care_id || !room_location_id || !bed_number || !room_class) {
    return apiResponse.badRequest('episode_of_care_id, room_location_id, bed_number, and room_class are required')
  }

  // 1. Get the episode to find patient_id and dpjp_id
  const { data: episode, error: epError } = await supabase
    .from('episodes_of_care')
    .select('patient_id, dpjp_id')
    .eq('id', episode_of_care_id)
    .single()

  if (epError || !episode) {
    return apiResponse.badRequest('Episode of care not found')
  }

  // 2. Infer admitted_from: IGD if patient has a pending inpatient transfer from emergency
  const { data: emergencyEnc } = await supabase
    .from('emergency_encounters')
    .select('id')
    .eq('patient_id', episode.patient_id)
    .eq('status', 'admitted_to_inpatient')
    .maybeSingle()

  const admitted_from = emergencyEnc ? 'igd' : 'outpatient'

  // 3. Patch episodes_of_care to assign the room
  const { error: patchError } = await supabase
    .from('episodes_of_care')
    .update({ room_location_id, bed_number })
    .eq('id', episode_of_care_id)

  if (patchError) return apiResponse.serverError(patchError.message)

  // 4. Create inpatient_admissions record
  const { data: admission, error: admissionError } = await supabase
    .from('inpatient_admissions')
    .insert({
      episode_of_care_id,
      patient_id: episode.patient_id,
      room_location_id,
      bed_number,
      room_class,
      dpjp_id: episode.dpjp_id,
      admitted_from,
      status: 'admitted',
      admission_date: new Date().toISOString(),
    })
    .select()
    .single()

  if (admissionError) return apiResponse.serverError(admissionError.message)

  return apiResponse.created(admission)
}
