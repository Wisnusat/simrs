import type { SyncHandler } from '../worker'
import { buildAllergy } from '../builders/allergy'
import { ensurePatientIhs } from '../patient-service'
import { logSync } from './helpers'

export const allergyHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: al, error } = await supabase
    .from('allergy_intolerances')
    .select(`*, patients:patient_id ( id, full_name ), encounters:encounter_id ( id, ss_encounter_id )`)
    .eq('id', job.local_id)
    .single()
  if (error || !al) throw new Error(`allergy ${job.local_id} not found: ${error?.message}`)

  const patientIhs = await ensurePatientIhs(supabase, fhir, (al.patients as any).id)
  const payload = buildAllergy({
    substanceDisplay: al.substance_display, category: al.category, criticality: al.criticality,
    reactionDescription: al.reaction_description, onsetDate: al.onset_date, isActive: al.is_active,
    patientIhs, patientName: (al.patients as any).full_name,
    ssEncounterId: (al.encounters as any)?.ss_encounter_id ?? null,
  })
  const res = await fhir.post('/AllergyIntolerance', payload)
  await logSync(supabase, {
    resource_type: 'AllergyIntolerance', local_id: al.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    const { error: updateErr } = await supabase.from('allergy_intolerances').update({ ss_sync_status: 'failed' }).eq('id', al.id)
    if (updateErr) console.error('Failed to persist allergy failed status:', updateErr.message)
    throw new Error(`AllergyIntolerance sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }
  const { error: updateErr } = await supabase.from('allergy_intolerances')
    .update({ ss_allergy_id: res.body.id, ss_sync_status: 'synced' })
    .eq('id', al.id)
  if (updateErr) throw new Error(`Failed to persist ss_allergy_id for allergy ${al.id}: ${updateErr.message}`)
}
