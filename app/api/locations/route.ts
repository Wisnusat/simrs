import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

/**
 * GET /api/locations
 * List locations filtered by type, with occupancy for rooms/wards.
 * Query: ?type=room|ward|poli|...
 */
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, 'locations:list', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const type = new URL(req.url).searchParams.get('type')

  let query = supabase
    .from('locations')
    .select('*')
    .eq('organization_id', practitioner.organization_id)
    .eq('is_active', true)
    .order('name')

  if (type) query = query.eq('type', type)

  const { data, error } = await query
  if (error) return apiResponse.serverError(error.message)

  // Compute occupancy for room-type locations
  if (type === 'room' || type === 'ward') {
    const locationIds = (data ?? []).map((l: any) => l.id)
    const { data: admissions } = await supabase
      .from('inpatient_admissions')
      .select('room_location_id')
      .in('room_location_id', locationIds.length > 0 ? locationIds : ['__none__'])
      .in('status', ['admitted', 'in_care'])

    const occupancyMap = new Map<string, number>()
    for (const a of (admissions ?? [])) {
      const rid = (a as any).room_location_id
      occupancyMap.set(rid, (occupancyMap.get(rid) ?? 0) + 1)
    }

    const enriched = (data ?? []).map((loc: any) => ({
      ...loc,
      occupied: occupancyMap.get(loc.id) ?? 0,
    }))
    return apiResponse.ok(enriched)
  }

  return apiResponse.ok(data)
}
