import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'

/**
 * POST /api/procedures
 * Records a clinical procedure (tindakan) for an encounter.
 * Body: { encounter_id, patient_id, procedure_code, procedure_display, notes?, is_surgery? }
 *
 * GET /api/procedures?encounter_id=...
 * Returns all procedures for an encounter, newest first.
 */

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, 'procedures:post', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const { encounter_id, patient_id, procedure_code, procedure_display, notes, is_surgery } = await req.json()

  if (!encounter_id || !patient_id || !procedure_code || !procedure_display)
    return apiResponse.badRequest('encounter_id, patient_id, procedure_code, procedure_display are required')

  const { data, error } = await supabase
    .from('procedures')
    .insert({
      encounter_id,
      patient_id,
      performed_by: practitioner.id,
      procedure_code,
      procedure_display,
      status: 'completed',
      notes: notes ?? null,
      is_surgery: is_surgery ?? false,
    })
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.created(data)
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, 'procedures:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const encounterId = new URL(req.url).searchParams.get('encounter_id')
  if (!encounterId) return apiResponse.badRequest('encounter_id is required')

  const { data, error } = await supabase
    .from('procedures')
    .select('*, practitioners(full_name, role)')
    .eq('encounter_id', encounterId)
    .order('performed_at', { ascending: false })

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}
