import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'

/**
 * GET /api/medications
 * Lists active medications for the practitioner's organisation with aggregated stock.
 * Query: ?search=... (name / generic_name ilike search, optional)
 *
 * This endpoint is shared by:
 *   - prescription form (outpatient / inpatient)
 *   - pharmacy stock management
 *   - any future feature requiring a medication catalogue
 */

export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'medications:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  console.log(practitioner)
  const search = new URL(req.url).searchParams.get('search') ?? ''

  let query = supabase
    .from('medications')
    .select('id, name, generic_name, brand_name, form, strength, unit, category, requires_prescription')
    .eq('organization_id', practitioner.organization_id)
    .eq('is_active', true)
    .order('name')

  if (search) query = query.or(`name.ilike.%${search}%,generic_name.ilike.%${search}%`)

  const { data: meds, error } = await query.limit(100)
  if (error) return apiResponse.serverError(error.message)

  // Aggregate stock per medication
  const medIds = (meds ?? []).map((m: any) => m.id)
  const { data: stocks } = await supabase
    .from('medication_stock')
    .select('medication_id, quantity')
    .in('medication_id', medIds.length > 0 ? medIds : ['__none__'])
    .eq('organization_id', practitioner.organization_id)
    .gt('quantity', 0)

  const stockMap = new Map<string, number>()
  for (const s of stocks ?? []) {
    stockMap.set((s as any).medication_id, (stockMap.get((s as any).medication_id) ?? 0) + (s as any).quantity)
  }

  return apiResponse.ok(
    (meds ?? []).map((m: any) => ({ ...m, stock_available: stockMap.get(m.id) ?? 0 }))
  )
}
