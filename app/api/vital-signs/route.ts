import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'
import { syncVitalSigns } from '@/lib/api/satu-sehat'

/**
 * POST /api/vital-signs
 * Records vital signs for an encounter.
 * Side-effects:
 *   - Sets encounter.status → in_progress
 *   - Sets queue.status → in_service (if queue_id provided)
 *   - Non-blocking Satu Sehat sync
 *
 * Body: { encounter_id, patient_id, queue_id?, systolic_bp, diastolic_bp,
 *         heart_rate, respiratory_rate, temperature, oxygen_saturation,
 *         weight_kg, height_cm, gcs_score, pain_scale, notes }
 *
 * GET /api/vital-signs?encounter_id=...
 * Returns all vital signs for an encounter, newest first.
 */

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, 'vital-signs:post', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const body = await req.json()
  const {
    encounter_id, patient_id, queue_id,
    systolic_bp, diastolic_bp, heart_rate, respiratory_rate,
    temperature, oxygen_saturation, weight_kg, height_cm,
    gcs_score, pain_scale, notes,
  } = body

  if (!encounter_id || !patient_id)
    return apiResponse.badRequest('encounter_id and patient_id are required')

  const { data: vs, error: vsError } = await supabase
    .from('vital_signs')
    .insert({
      encounter_id,
      patient_id,
      recorded_by: practitioner.id,
      systolic_bp: systolic_bp ?? null,
      diastolic_bp: diastolic_bp ?? null,
      heart_rate: heart_rate ?? null,
      respiratory_rate: respiratory_rate ?? null,
      temperature: temperature ?? null,
      oxygen_saturation: oxygen_saturation ?? null,
      weight_kg: weight_kg ?? null,
      height_cm: height_cm ?? null,
      gcs_score: gcs_score ?? null,
      pain_scale: pain_scale ?? null,
      notes: notes ?? null,
    })
    .select()
    .single()

  if (vsError) return apiResponse.serverError(vsError.message)

  // Side-effects (non-critical — fire-and-forget)
  await supabase
    .from('encounters')
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', encounter_id)

  if (queue_id) {
    await supabase
      .from('queues')
      .update({ status: 'in_service', served_at: new Date().toISOString() })
      .eq('id', queue_id)
  }

  syncVitalSigns(supabase, (vs as any).id, {
    encounter_id, systolic_bp, diastolic_bp, heart_rate, temperature, weight_kg, height_cm,
  }).catch(() => { })

  return apiResponse.created(vs)
}

export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'vital-signs:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const encounterId = new URL(req.url).searchParams.get('encounter_id')
  if (!encounterId) return apiResponse.badRequest('encounter_id is required')

  const { data, error } = await supabase
    .from('vital_signs')
    .select('*, practitioners ( full_name, role )')
    .eq('encounter_id', encounterId)
    .order('recorded_at', { ascending: false })

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}
