import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'
import { syncDiagnosis } from '@/lib/api/satu-sehat'

/**
 * POST /api/diagnoses
 * Adds an ICD-10 diagnosis to an encounter.
 * Body: { encounter_id, patient_id, icd10_code, icd10_display, diagnosis_type?,
 *         clinical_status?, onset_date?, notes? }
 *
 * GET /api/diagnoses?encounter_id=...
 * Returns all diagnoses for an encounter.
 */

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, 'diagnoses:post', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const { encounter_id, patient_id, icd10_code, icd10_display,
    diagnosis_type, clinical_status, onset_date, notes } = await req.json()

  if (!encounter_id || !patient_id || !icd10_code || !icd10_display)
    return apiResponse.badRequest('encounter_id, patient_id, icd10_code, icd10_display are required')

  const { data, error } = await supabase
    .from('diagnoses')
    .insert({
      encounter_id,
      patient_id,
      recorded_by: practitioner.id,
      icd10_code,
      icd10_display,
      diagnosis_type: diagnosis_type ?? 'primary',
      clinical_status: clinical_status ?? 'active',
      onset_date: onset_date ?? null,
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)

  syncDiagnosis(supabase, (data as any).id, { encounter_id, icd10_code, icd10_display }).catch(() => { })

  return apiResponse.created(data)
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, 'diagnoses:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const encounterId = new URL(req.url).searchParams.get('encounter_id')
  if (!encounterId) return apiResponse.badRequest('encounter_id is required')

  const { data, error } = await supabase
    .from('diagnoses')
    .select('*, practitioners(full_name)')
    .eq('encounter_id', encounterId)
    .order('created_at', { ascending: false })

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}
