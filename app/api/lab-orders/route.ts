import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'

/**
 * POST /api/lab-orders
 * Doctor orders one or more lab tests for an encounter.
 * Body: {
 *   encounter_id, patient_id, priority?, clinical_notes?,
 *   items: [{ test_name, loinc_code, specimen_type? }]
 * }
 *
 * GET /api/lab-orders
 * Query params (all optional):
 *   encounter_id   filter by encounter
 *   status         filter by workflow status
 *   today          "1" to restrict to today's orders
 */

export async function POST(req: NextRequest) {
  const rl = rateLimit(req, 'lab-orders:post', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  if (!['doctor', 'admin'].includes(practitioner.role))
    return apiResponse.forbidden('Only doctors can order lab tests')

  const { encounter_id, patient_id, priority, clinical_notes, items } = await req.json()

  if (!encounter_id || !patient_id || !items?.length)
    return apiResponse.badRequest('encounter_id, patient_id, and at least one item are required')

  const { data: order, error: orderError } = await supabase
    .from('lab_orders')
    .insert({
      encounter_id,
      patient_id,
      ordered_by: practitioner.id,
      priority: priority ?? 'routine',
      clinical_notes: clinical_notes ?? null,
      status: 'lab_ordered',
    })
    .select()
    .single()

  if (orderError) return apiResponse.serverError(orderError.message)

  const { data: labItems, error: itemsError } = await supabase
    .from('lab_order_items')
    .insert(
      (items as any[]).map((item) => ({
        lab_order_id: (order as any).id,
        test_name: item.test_name,
        loinc_code: item.loinc_code ?? null,
        specimen_type: item.specimen_type ?? null,
      }))
    )
    .select()

  if (itemsError) return apiResponse.serverError(itemsError.message)

  return apiResponse.created({ ...order, lab_order_items: labItems })
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req, 'lab-orders:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { searchParams } = new URL(req.url)
  const encounterId = searchParams.get('encounter_id')
  const status = searchParams.get('status')
  const today = searchParams.get('today')

  let query = supabase
    .from('lab_orders')
    .select(`
      *,
      patients ( full_name, medical_record_no ),
      doctor:practitioners!lab_orders_ordered_by_fkey (
        id,
        full_name
      ),
      lab_order_items ( * )
    `)
    .order('order_date', { ascending: false })

  if (encounterId) query = query.eq('encounter_id', encounterId)
  if (status) query = query.eq('status', status)
  if (today === '1') {
    const d = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    query = query.gte('order_date', d)
  }

  const { data, error } = await query
  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}
