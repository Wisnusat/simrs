import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { enqueueSync } from '@/lib/satusehat/queue'

/**
 * GET /api/episodes-of-care
 * List episodes, optionally filtered by status or patient.
 *
 * POST /api/episodes-of-care
 * Create a new episode (triggered when doctor admits a patient to inpatient).
 */
export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'episodes:list', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const patientId = searchParams.get('patient_id')

  let query = supabase
    .from('episodes_of_care')
    .select(`
      *,
      patients ( full_name, medical_record_no, date_of_birth, gender ),
      locations:room_location_id ( id, name, type, floor ),
      dpjp:practitioners!episodes_of_care_dpjp_id_fkey ( full_name, role )
    `)
    .eq('organization_id', practitioner.organization_id)
    .order('start_date', { ascending: false })

  if (status) query = query.eq('status', status)
  if (patientId) query = query.eq('patient_id', patientId)

  const { data, error } = await query.limit(200)
  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, 'episodes:create', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const body = await req.json()

  const { patient_id, room_location_id, bed_number, dpjp_id, diagnosis_primary } = body

  if (!patient_id || !dpjp_id) {
    return apiResponse.badRequest('patient_id and dpjp_id are required')
  }

  // Resolve __self__ to current practitioner
  const resolvedDpjpId = dpjp_id === '__self__' ? practitioner.id : dpjp_id

  const { data, error } = await supabase
    .from('episodes_of_care')
    .insert({
      patient_id,
      organization_id: practitioner.organization_id,
      start_date: new Date().toISOString().split('T')[0],
      status: 'admitted',
      diagnosis_primary: diagnosis_primary ?? null,
      room_location_id: room_location_id ?? null,
      bed_number: bed_number ?? null,
      dpjp_id: resolvedDpjpId,
    })
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)
  enqueueSync(supabase, 'EpisodeOfCare', (data as any).id).catch(() => {})
  return apiResponse.created(data)
}
