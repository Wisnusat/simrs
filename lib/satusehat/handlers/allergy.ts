import type { SyncHandler } from '../worker'
import { buildAllergy } from '../builders/allergy'
import { ensurePatientIhs } from '../patient-service'
import { logSync } from './helpers'

export const allergyHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: al, error } = await supabase
    .from('allergy_intolerances')
    .select(`
      id, substance_display, category, criticality, reaction_description,
      onset_date, is_active, ss_allergy_id,
      patients:patient_id ( id, full_name ),
      encounters:encounter_id ( id, ss_encounter_id )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !al) throw new Error(`allergy ${job.local_id} not found: ${error?.message}`)

  const patientIhs = await ensurePatientIhs(supabase, fhir, (al.patients as any).id)
  const payload = buildAllergy({
    substanceDisplay: al.substance_display,
    category: al.category,
    criticality: al.criticality,
    reactionDescription: al.reaction_description,
    onsetDate: al.onset_date,
    isActive: al.is_active ?? true,
    patientIhs,
    patientName: (al.patients as any).full_name,
    ssEncounterId: (al.encounters as any)?.ss_encounter_id ?? null,
  })

  const existingId = (al as any).ss_allergy_id as string | null
  const action = existingId ? 'PUT' : 'POST'
  const res = existingId
    ? await fhir.put(`/AllergyIntolerance/${existingId}`, { ...payload, id: existingId })
    : await fhir.post('/AllergyIntolerance', payload)

  await logSync(supabase, {
    resource_type: 'AllergyIntolerance', local_id: al.id, ss_resource_id: res.body?.id ?? existingId ?? undefined,
    action, request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })

  if (!res.ok) {
    await supabase.from('allergy_intolerances').update({ ss_sync_status: 'failed' }).eq('id', al.id)
    throw new Error(`AllergyIntolerance sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }

  const { error: updateErr } = await supabase.from('allergy_intolerances')
    .update({ ss_allergy_id: res.body?.id ?? existingId, ss_sync_status: 'synced' })
    .eq('id', al.id)
  if (updateErr) throw new Error(`Failed to persist ss_allergy_id for allergy ${al.id}: ${updateErr.message}`)
}
