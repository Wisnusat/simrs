import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

/**
 * GET /api/medical-resumes?encounter_id=&patient_id=
 * POST /api/medical-resumes — create or upsert resume for an encounter
 */

export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'medical-resumes:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { searchParams } = new URL(req.url)
  const encounterId = searchParams.get('encounter_id')
  const patientId = searchParams.get('patient_id')

  let query = supabase
    .from('medical_resumes')
    .select('*, practitioners:authored_by ( full_name, role )')
    .order('created_at', { ascending: false })

  if (encounterId) query = query.eq('encounter_id', encounterId)
  if (patientId) query = query.eq('patient_id', patientId)

  const { data, error } = await query
  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, 'medical-resumes:post', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  if (!['doctor', 'admin'].includes(practitioner.role))
    return apiResponse.forbidden('Only doctors can write medical resumes')

  const body = await req.json()
  if (!body.encounter_id || !body.patient_id)
    return apiResponse.badRequest('encounter_id and patient_id are required')

  // Upsert — one resume per encounter
  const { data: existing } = await supabase
    .from('medical_resumes')
    .select('id')
    .eq('encounter_id', body.encounter_id)
    .single()

  const payload = {
    encounter_id: body.encounter_id,
    patient_id: body.patient_id,
    authored_by: practitioner.id,
    chief_complaint: body.chief_complaint ?? null,
    history_of_illness: body.history_of_illness ?? null,
    physical_examination: body.physical_examination ?? null,
    summary: body.summary ?? null,
    follow_up_plan: body.follow_up_plan ?? null,
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from('medical_resumes')
      .update(payload)
      .eq('id', existing.id)
      .select('*, practitioners:authored_by ( full_name, role )')
      .single()
    if (error) return apiResponse.serverError(error.message)
    return apiResponse.ok(data)
  }

  const { data, error } = await supabase
    .from('medical_resumes')
    .insert(payload)
    .select('*, practitioners:authored_by ( full_name, role )')
    .single()

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.created(data)
}
