import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'

const ROOM_CLASSES = ['vip', 'kelas_1', 'kelas_2', 'kelas_3'] as const

/**
 * GET /api/cms/room-rates
 * Returns room rates for the authenticated practitioner's organization.
 *
 * PUT /api/cms/room-rates
 * Body: { vip: number, kelas_1: number, kelas_2: number, kelas_3: number }
 * Upserts all 4 room class rates.
 */

export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'cms:room-rates:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth

  const { data, error } = await supabase
    .from('room_rates')
    .select('room_class, daily_rate')
    .eq('organization_id', practitioner.organization_id)

  if (error) return apiResponse.serverError(error.message)

  // Return as flat object { vip, kelas_1, kelas_2, kelas_3 }
  const rates: Record<string, number> = { vip: 0, kelas_1: 0, kelas_2: 0, kelas_3: 0 }
  for (const row of data ?? []) {
    rates[row.room_class] = Number(row.daily_rate)
  }

  return apiResponse.ok(rates)
}

export async function PUT(req: NextRequest) {
  const rl = await rateLimit(req, 'cms:room-rates:put', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const body = await req.json()

  for (const cls of ROOM_CLASSES) {
    if (body[cls] == null || isNaN(Number(body[cls])) || Number(body[cls]) < 0) {
      return apiResponse.badRequest(`Invalid rate for room class: ${cls}`)
    }
  }

  const rows = ROOM_CLASSES.map((cls) => ({
    organization_id: practitioner.organization_id,
    room_class: cls,
    daily_rate: Number(body[cls]),
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('room_rates')
    .upsert(rows, { onConflict: 'organization_id,room_class' })

  if (error) return apiResponse.serverError(error.message)

  return apiResponse.ok({ message: 'Tarif kamar berhasil disimpan' })
}
