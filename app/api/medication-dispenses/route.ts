import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

/**
 * GET /api/medication-dispenses?episode_of_care_id=...
 * Returns all medication dispenses for an inpatient episode.
 * Used by nurses to see what medications have been dispensed for a patient.
 */
export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'medication-dispenses:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { searchParams } = new URL(req.url)
  const episodeOfCareId = searchParams.get('episode_of_care_id')

  if (!episodeOfCareId) return apiResponse.badRequest('episode_of_care_id required')

  // Get all encounter IDs for this episode
  const { data: encounters } = await supabase
    .from('encounters')
    .select('id')
    .eq('episode_of_care_id', episodeOfCareId)

  const encounterIds = (encounters ?? []).map((e: any) => e.id)
  if (encounterIds.length === 0) return apiResponse.ok([])

  const { data, error } = await supabase
    .from('medication_dispenses')
    .select(`
      id,
      quantity_dispensed,
      dispensed_at,
      encounter_id,
      medications ( name, form, strength, unit ),
      dispensed_by:practitioners!medication_dispenses_dispensed_by_fkey ( full_name )
    `)
    .in('encounter_id', encounterIds)
    .order('dispensed_at', { ascending: false })

  if (error) return apiResponse.serverError(error.message)

  return apiResponse.ok(data ?? [])
}
