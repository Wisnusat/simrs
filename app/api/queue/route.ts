import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'

/**
 * GET /api/queue
 * Returns the queue for a given date (defaults to today), enriched with:
 *   - patient info
 *   - vital_signs_recorded flag
 *   - linked encounter (id + status)
 *
 * Query params:
 *   date            YYYY-MM-DD (default: today)
 *   poli_service_id (optional filter)
 *
 * PATCH /api/queue
 * Update a queue entry's status.
 * Body: { queue_id, status }
 * Valid statuses: waiting | called | in_service | done | skipped
 */

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, 'queue:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const { searchParams } = new URL(req.url)
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
  const poliServiceId = searchParams.get('poli_service_id')

  let query = supabase
    .from('queues')
    .select(`
      id,
      queue_number,
      queue_prefix,
      sequence_number,
      status,
      called_at,
      served_at,
      done_at,
      queue_date,
      patient_id,
      appointment_id,
      poli_service_id,
      patients ( id, full_name, medical_record_no, date_of_birth, gender, phone ),
      appointments ( payment_type ),
      poli_services ( id, name, code )
    `)
    .eq('queue_date', date)
    .order('sequence_number', { ascending: true })

  if (poliServiceId) {
    query = query.eq('poli_service_id', poliServiceId)
  } else {
    const { data: orgPolis } = await supabase
      .from('poli_services')
      .select('id')
      .eq('organization_id', practitioner.organization_id)

    const poliIds = (orgPolis ?? []).map((p: any) => p.id)
    if (poliIds.length > 0) query = query.in('poli_service_id', poliIds)
  }

  const { data, error } = await query
  if (error) return apiResponse.serverError(error.message)

  const today = new Date().toISOString().split("T")[0]

  // Enrich: vital_signs_recorded flag
  const patientIds = (data ?? []).map((q: any) => q.patient_id)
  const { data: vitalSignsToday } = await supabase
    .from('vital_signs')
    .select('patient_id')
    .in('patient_id', patientIds.length > 0 ? patientIds : ['__none__'])
    .gte('created_at', `${new Date(today).toISOString()}`)

  const vsSigned = new Set((vitalSignsToday ?? []).map((v: any) => v.patient_id))

  // Enrich: linked encounter
  const { data: encounters } = await supabase
    .from('encounters')
    .select('id, patient_id, status')
    .in('patient_id', patientIds.length > 0 ? patientIds : ['__none__'])
    .gte('created_at', `${new Date(today).toISOString()}`)

  const encounterMap = new Map((encounters ?? []).map((e: any) => [e.patient_id, e]))

  const enriched = (data ?? []).map((q: any) => ({
    ...q,
    vital_signs_recorded: vsSigned.has(q.patient_id),
    encounter: encounterMap.get(q.patient_id) ?? null,
  }))

  return apiResponse.ok(enriched)
}

export async function PATCH(req: NextRequest) {
  const rl = rateLimit(req, 'queue:patch', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const body = await req.json()
  const { queue_id, status } = body

  if (!queue_id || !status) return apiResponse.badRequest('queue_id and status are required')

  const valid = ['waiting', 'called', 'in_service', 'done', 'skipped']
  if (!valid.includes(status))
    return apiResponse.badRequest(`Invalid status. Must be one of: ${valid.join(', ')}`)

  const updateData: Record<string, unknown> = {
    status,
    ...(status === 'called' ? { called_at: new Date().toISOString(), called_by: practitioner.id } : {}),
    ...(status === 'in_service' ? { served_at: new Date().toISOString() } : {}),
    ...(status === 'done' || status === 'skipped' ? { done_at: new Date().toISOString() } : {}),
  }

  const { data, error } = await supabase
    .from('queues')
    .update(updateData)
    .eq('id', queue_id)
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}
