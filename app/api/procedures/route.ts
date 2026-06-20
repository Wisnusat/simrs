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
  const rl = await rateLimit(req, 'procedures:post', RATE_LIMITS.write)
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

  // Auto-add tindakan to running bill for inpatient encounters (fire-and-forget)
  if (!is_surgery) {
    ;(async () => {
      try {
        const { data: enc } = await supabase
          .from('encounters')
          .select('encounter_class, episode_of_care_id, patient_id')
          .eq('id', encounter_id)
          .maybeSingle()

        if (enc?.encounter_class === 'inpatient' && enc?.episode_of_care_id) {
          await supabase.from('running_bills').insert({
            episode_of_care_id: enc.episode_of_care_id,
            patient_id: (enc as any).patient_id ?? patient_id,
            item_type: 'action',
            item_name: procedure_display,
            item_code: procedure_code,
            quantity: 1,
            unit_price: 0,
            reference_id: (data as any).id,
            charge_date: new Date().toISOString().split('T')[0],
          })
        }
      } catch { /* non-critical, ignore */ }
    })()
  }

  return apiResponse.created(data)
}

export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'procedures:get', RATE_LIMITS.read)
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
