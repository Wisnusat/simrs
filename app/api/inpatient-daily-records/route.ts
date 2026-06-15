import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

/**
 * GET  /api/inpatient-daily-records?admission_id=...
 * POST /api/inpatient-daily-records — create daily record linking admission + encounter
 */
export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'daily-records:list', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const admissionId = new URL(req.url).searchParams.get('admission_id')
  if (!admissionId) return apiResponse.badRequest('admission_id is required')

  const { data, error } = await supabase
    .from('inpatient_daily_records')
    .select(`
      *,
      encounters:encounter_id (
        id, status, started_at, finished_at,
        doctor_id, nurse_id,
        vital_signs ( id, systolic_bp, diastolic_bp, heart_rate, temperature, oxygen_saturation, weight_kg, recorded_at ),
        clinical_notes ( id, subjective, objective, assessment, plan, note_date, writer_role, practitioners(full_name, role) ),
        diagnoses ( id, icd10_code, icd10_display, diagnosis_type ),
        prescriptions ( id, status, prescription_date, prescription_items(*, medications(name, form, strength)) ),
        lab_orders ( id, status, order_date, lab_order_items(*) )
      )
    `)
    .eq('admission_id', admissionId)
    .order('record_date', { ascending: false })

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.ok(data)
}

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, 'daily-records:create', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const body = await req.json()
  const { admission_id, encounter_id, record_date, shift } = body

  if (!admission_id || !encounter_id) {
    return apiResponse.badRequest('admission_id and encounter_id are required')
  }

  // Auto-detect shift from current time if not provided
  let resolvedShift = shift
  if (!resolvedShift) {
    const hour = new Date().getHours()
    if (hour >= 7 && hour < 14) resolvedShift = 'pagi'
    else if (hour >= 14 && hour < 21) resolvedShift = 'sore'
    else resolvedShift = 'malam'
  }

  const { data, error } = await supabase
    .from('inpatient_daily_records')
    .insert({
      admission_id,
      encounter_id,
      record_date: record_date ?? new Date().toISOString().split('T')[0],
      shift: resolvedShift,
    })
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)
  return apiResponse.created(data)
}
