import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { enqueueSync } from '@/lib/satusehat/queue'

/**
 * PATCH /api/nutrition-orders/[id] — update nutrition order
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = await rateLimit(req, 'nutrition:patch', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { id } = await params
  const body = await req.json()

  const allowedFields = [
    'nutritional_status', 'dietary_restrictions',
    'energy_needs_kcal', 'protein_needs_g',
    'meal_plan', 'notes', 'is_active',
  ]
  const update: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field]
  }

  const { data, error } = await supabase
    .from('nutrition_orders')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)
  enqueueSync(supabase, 'NutritionOrder', id).catch(() => {})
  return apiResponse.ok(data)
}
