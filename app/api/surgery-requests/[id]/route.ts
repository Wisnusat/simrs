import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { enqueueSync } from '@/lib/satusehat/queue'

/**
 * PATCH /api/surgery-requests/[id]
 * Updates a surgery request record (e.g. status, schedule, pre-op, intra-op, post-op, PACU notes).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rl = await rateLimit(req, 'surgery:patch', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { id } = await params
  const body = await req.json()

  // 1. Fetch current surgery request to check status transitions
  const { data: current, error: getError } = await supabase
    .from('surgery_requests')
    .select('*')
    .eq('id', id)
    .single()

  if (getError || !current) {
    return apiResponse.notFound('Surgery request not found')
  }

  // 2. Perform the update
  const { data: updated, error: patchError } = await supabase
    .from('surgery_requests')
    .update({
      ...body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (patchError) return apiResponse.serverError(patchError.message)

  // 3. Clinical EHR Standard: If surgery just transitioned to 'surgery_completed' or 'post_operative', 
  // write an entry into the clinical 'procedures' table automatically.
  const oldStatus = current.status
  const newStatus = updated.status

  const isTransitioningToCompleted =
    (oldStatus !== 'surgery_completed' && oldStatus !== 'post_operative') &&
    (newStatus === 'surgery_completed' || newStatus === 'post_operative')

  if (isTransitioningToCompleted) {
    // Insert into procedures table
    const surgeonId = updated.surgeon_id || updated.requested_by
    const procedureCode = '100' // General Code for Surgical Intervention
    const procedureDisplay = updated.surgery_type

    const notesCombined = [
      updated.indication ? `Indikasi: ${updated.indication}` : '',
      updated.pre_op_assessment ? `Asesmen Pra-Bedah: ${updated.pre_op_assessment}` : '',
      updated.intra_op_notes ? `Catatan Intra-Operasi: ${updated.intra_op_notes}` : '',
      updated.post_op_notes ? `Catatan Pasca-Operasi: ${updated.post_op_notes}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')

    const { error: procError } = await supabase
      .from('procedures')
      .insert({
        encounter_id: updated.encounter_id,
        patient_id: updated.patient_id,
        performed_by: surgeonId,
        procedure_code: procedureCode,
        procedure_display: procedureDisplay,
        performed_at: updated.surgery_end_at || new Date().toISOString(),
        status: 'completed',
        notes: notesCombined || null,
        is_surgery: true,
      })

    if (procError) {
      console.error('Failed to auto-insert clinical procedure entry:', procError.message)
    } else {
      // Enqueue FHIR Procedure sync (fire-and-forget)
      const { data: inserted } = await supabase
        .from('procedures')
        .select('id')
        .eq('encounter_id', updated.encounter_id)
        .eq('patient_id', updated.patient_id)
        .eq('is_surgery', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (inserted?.id) enqueueSync(supabase, 'Procedure', inserted.id).catch(() => {})
    }
  }

  return apiResponse.ok(updated)
}
