import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

/**
 * GET  /api/allergies?patient_id=...
 * POST /api/allergies — record new allergy for a patient
 */
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, 'allergies:list', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const patientId = new URL(req.url).searchParams.get('patient_id')
  if (!patientId) return apiResponse.badRequest('patient_id is required')

  const { data, error } = await supabase
    .from('allergy_intolerances')
    .select('*, practitioners:recorded_by ( full_name, role )')
    .eq('patient_id', patientId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, 'allergies:create', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const body = await req.json()

  const { patient_id, substance_display, substance_code, category, criticality, reaction_description, onset_date, encounter_id } = body

  if (!patient_id || !substance_display) {
    return apiResponse.badRequest('patient_id and substance_display are required')
  }

  const { data, error } = await supabase
    .from('allergy_intolerances')
    .insert({
      patient_id,
      recorded_by: practitioner.id,
      encounter_id: encounter_id ?? null,
      substance_display,
      substance_code: substance_code ?? null,
      category: category ?? 'medication',
      criticality: criticality ?? 'low',
      reaction_description: reaction_description ?? null,
      onset_date: onset_date ?? null,
      is_active: true,
    })
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.created(data)
}
