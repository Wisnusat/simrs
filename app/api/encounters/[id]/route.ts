import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'
import { syncEncounter } from '@/lib/api/satu-sehat'
import { syncInvoiceForEncounter } from '@/lib/api/invoice-builder'

/**
 * GET /api/encounters/[id]
 * Full encounter with all related clinical data:
 *   patients, vital_signs, clinical_notes, diagnoses, procedures,
 *   prescriptions (with items), lab_orders (with items)
 *
 * PATCH /api/encounters/[id]
 * Allowed fields: status, doctor_id, nurse_id, finished_at, arrived_at, started_at
 * - Finishing an encounter auto-stamps finished_at.
 * - Starting an encounter auto-assigns doctor_id.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = rateLimit(req, 'encounters:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { id } = await params

  const { data: encounter, error } = await supabase
    .from('encounters')
    .select(`
      *,
      patients (
        id, full_name, medical_record_no, date_of_birth, gender,
        blood_type, phone, email, address, nik, bpjs_no
      ),
      poli_services ( id, name, code ),
      appointments ( id, chief_complaint, booking_code, payment_type, bpjs_referral_no )
    `)
    .eq('id', id)
    .single()

  if (error || !encounter) return apiResponse.notFound('Encounter not found')

  // Fetch related clinical data in parallel
  const [vsRes, notesRes, diagRes, procRes, prescRes, labRes] = await Promise.all([
    supabase
      .from('vital_signs')
      .select('*, practitioners(full_name)')
      .eq('encounter_id', id)
      .order('recorded_at', { ascending: false }),
    supabase
      .from('clinical_notes')
      .select('*, practitioners(full_name, role)')
      .eq('encounter_id', id)
      .order('note_date', { ascending: false }),
    supabase
      .from('diagnoses')
      .select('*, practitioners(full_name)')
      .eq('encounter_id', id),
    supabase
      .from('procedures')
      .select('*, practitioners(full_name)')
      .eq('encounter_id', id),
    supabase
      .from('prescriptions')
      .select(`
        *,
        practitioners(full_name),
        prescription_items(
          *,
          medications(id, name, generic_name, form, strength, unit)
        )
      `)
      .eq('encounter_id', id),
    supabase
      .from('lab_orders')
      .select('*, practitioners(full_name), lab_order_items(*)')
      .eq('encounter_id', id),
  ])

  return apiResponse.ok({
    ...encounter,
    vital_signs: vsRes.data ?? [],
    clinical_notes: notesRes.data ?? [],
    diagnoses: diagRes.data ?? [],
    procedures: procRes.data ?? [],
    prescriptions: prescRes.data ?? [],
    lab_orders: labRes.data ?? [],
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = rateLimit(req, 'encounters:patch', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const { id } = await params
  const body = await req.json()

  const allowedFields = ['status', 'doctor_id', 'nurse_id', 'finished_at', 'arrived_at', 'started_at', 'episode_of_care_id']
  const update: Record<string, unknown> = {}
  for (const field of allowedFields) {
    if (field in body) update[field] = body[field]
  }

  if (body.status === 'finished' && !update.finished_at) {
    update.finished_at = new Date().toISOString()
    update.doctor_id = practitioner.id
  }
  if (body.status === 'in_progress' && !update.doctor_id && practitioner.role === 'doctor') {
    update.doctor_id = practitioner.id
  }

  const { data, error } = await supabase
    .from('encounters')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return apiResponse.serverError(error.message)

  // Sync the invoice any time the encounter is updated (e.g. going to finished, or back to in_progress from lab)
  await syncInvoiceForEncounter(supabase, id)

  if (body.status === 'finished') {
    syncEncounter(supabase, id, { status: 'finished' }).catch(() => { })
  }

  return apiResponse.ok(data)
}
