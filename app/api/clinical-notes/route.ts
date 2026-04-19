import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'
import { syncClinicalNote } from '@/lib/api/satu-sehat'

/**
 * POST /api/clinical-notes
 * Inserts a SOAP clinical note for an encounter (doctor or nurse).
 * Body: { encounter_id, patient_id, subjective?, objective?, assessment?, plan? }
 *
 * GET /api/clinical-notes?encounter_id=...
 * Returns all clinical notes for an encounter, newest first.
 */

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, 'clinical-notes:post', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const { encounter_id, patient_id, subjective, objective, assessment, plan } = await req.json()

  if (!encounter_id || !patient_id)
    return apiResponse.badRequest('encounter_id and patient_id are required')

  const { data, error } = await supabase
    .from('clinical_notes')
    .insert({
      encounter_id,
      patient_id,
      written_by: practitioner.id,
      writer_role: practitioner.role,
      subjective: subjective ?? null,
      objective: objective ?? null,
      assessment: assessment ?? null,
      plan: plan ?? null,
    })
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)

  syncClinicalNote(supabase, (data as any).id, { encounter_id, patient_id }).catch(() => { })

  return apiResponse.created(data)
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, 'clinical-notes:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const encounterId = new URL(req.url).searchParams.get('encounter_id')
  if (!encounterId) return apiResponse.badRequest('encounter_id is required')

  const { data, error } = await supabase
    .from('clinical_notes')
    .select('*, practitioners(full_name, role)')
    .eq('encounter_id', encounterId)
    .order('note_date', { ascending: false })

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}
