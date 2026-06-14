import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, 'running-bills:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { searchParams } = new URL(req.url)
  const episodeOfCareId = searchParams.get('episode_of_care_id')

  if (!episodeOfCareId) return apiResponse.badRequest('episode_of_care_id required')

  const { data, error } = await supabase
    .from('running_bills')
    .select('*')
    .eq('episode_of_care_id', episodeOfCareId)
    .order('charge_date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) return apiResponse.internalError(error.message)
  return apiResponse.ok(data ?? [])
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, 'running-bills:post', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const allowed = ['nurse', 'doctor', 'admin']
  if (!allowed.includes(practitioner.role)) return apiResponse.forbidden('Akses ditolak')

  const body = await req.json()
  const { episode_of_care_id, patient_id, item_type, item_name, item_code, quantity, unit_price, charge_date } = body

  if (!episode_of_care_id || !patient_id || !item_type || !item_name || quantity == null || unit_price == null) {
    return apiResponse.badRequest('Field wajib: episode_of_care_id, patient_id, item_type, item_name, quantity, unit_price')
  }

  const { data, error } = await supabase
    .from('running_bills')
    .insert({
      episode_of_care_id,
      patient_id,
      item_type,
      item_name,
      item_code: item_code ?? null,
      quantity: Number(quantity),
      unit_price: Number(unit_price),
      charge_date: charge_date ?? new Date().toISOString().split('T')[0],
    })
    .select()
    .single()

  if (error) return apiResponse.internalError(error.message)
  return apiResponse.created(data)
}
