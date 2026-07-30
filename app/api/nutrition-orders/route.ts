import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { enqueueSync } from '@/lib/satusehat/queue'

/**
 * GET  /api/nutrition-orders?episode_of_care_id=...
 * POST /api/nutrition-orders — create nutrition order for an episode
 */
export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'nutrition:list', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const episodeId = new URL(req.url).searchParams.get('episode_of_care_id')
  if (!episodeId) return apiResponse.badRequest('episode_of_care_id is required')

  const { data, error } = await supabase
    .from('nutrition_orders')
    .select('*, practitioners:nutritionist_id ( full_name )')
    .eq('episode_of_care_id', episodeId)
    .order('order_date', { ascending: false })

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, 'nutrition:create', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const body = await req.json()

  const {
    episode_of_care_id, patient_id, encounter_id,
    nutritional_status, dietary_restrictions,
    energy_needs_kcal, protein_needs_g,
    meal_plan, notes,
  } = body

  if (!episode_of_care_id || !patient_id) {
    return apiResponse.badRequest('episode_of_care_id and patient_id are required')
  }

  const { data, error } = await supabase
    .from('nutrition_orders')
    .insert({
      episode_of_care_id,
      patient_id,
      nutritionist_id: practitioner.id,
      encounter_id: encounter_id ?? null,
      order_date: new Date().toISOString().split('T')[0],
      nutritional_status: nutritional_status ?? null,
      dietary_restrictions: dietary_restrictions ?? null,
      energy_needs_kcal: energy_needs_kcal ?? null,
      protein_needs_g: protein_needs_g ?? null,
      meal_plan: meal_plan ?? {},
      notes: notes ?? null,
      is_active: true,
    })
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)
  enqueueSync(supabase, 'NutritionOrder', (data as any).id).catch(() => {})
  return apiResponse.created(data)
}
