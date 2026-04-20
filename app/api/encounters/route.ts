import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

/**
 * GET /api/encounters
 * List encounters for this org, optionally filtered by status and/or date.
 * Query params:
 *   status   e.g. "waiting_lab" | "waiting_payment" | "in_progress"
 *   date     YYYY-MM-DD (defaults to today)
 *   today    "1" — shorthand for current date filter
 */
export async function GET(req: NextRequest) {
  const rl = rateLimit(req, 'encounters:list', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const today = searchParams.get('today')
  const dateParam = searchParams.get('date')
  const date = dateParam ?? (today === '1' ? new Date().toISOString().split('T')[0] : null)

  let query = supabase
    .from('encounters')
    .select(`
      *,
      patients ( id, full_name, medical_record_no, date_of_birth, gender, phone ),
      poli_services ( id, name, code ),
      vital_signs ( id, systolic_bp, diastolic_bp, heart_rate, temperature, oxygen_saturation, weight_kg, recorded_at ),
      lab_orders ( id, status, order_date, lab_order_items(*) )
    `)
    .eq('organization_id', practitioner.organization_id)
    .order('started_at', { ascending: true })

  if (status) query = query.eq('status', status)
  if (date) {
    query = query
      .gte('arrived_at', `${date}T00:00:00`)
      .lte('arrived_at', `${date}T23:59:59`)
  }

  const { data, error } = await query.limit(200)
  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}

/**
 * POST /api/encounters
 *
 * Creates a new encounter for a patient, triggered by the nurse when
 * calling a patient from the queue ("Panggil" action).
 *
 * Body: {
 *   patient_id      string
 *   poli_service_id string
 *   appointment_id? string   — links back to the original booking
 *   queue_id?       string   — links back to the active queue entry
 *   payment_type?   string   — defaults to 'general'
 *   organization_id string
 * }
 *
 * Returns the created encounter row.
 */
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, 'encounters:create', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth

  const {
    patient_id,
    poli_service_id,
    appointment_id,
    queue_id,
    payment_type,
    organization_id,
    encounter_class,
  } = await req.json()

  if (!patient_id || !poli_service_id || !payment_type || !encounter_class) {
    return apiResponse.badRequest('patient_id, poli_service_id, payment_type and encounter_class are required')
  }

  // Guard: don't create a duplicate encounter for the same appointment today
  if (appointment_id) {
    const { data: existing } = await supabase
      .from('encounters')
      .select('id, status')
      .eq('appointment_id', appointment_id)
      .maybeSingle()

    if (existing) {
      return apiResponse.ok(existing) // idempotent — return existing
    }
  }

  const { data: encounter, error } = await supabase
    .from('encounters')
    .insert({
      patient_id,
      poli_service_id,
      organization_id: organization_id ?? practitioner.organization_id,
      appointment_id: appointment_id ?? null,
      nurse_id: practitioner.id,
      queue_id,
      status: 'in_progress',
      arrived_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      payment_type: payment_type,
      encounter_class: encounter_class,
    })
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)

  // Link encounter back to the queue entry so the queue GET enrichment picks it up
  if (queue_id) {
    await supabase
      .from('queues')
      .update({ status: 'called' })
      .eq('id', queue_id)
  }

  return apiResponse.created(encounter)
}
