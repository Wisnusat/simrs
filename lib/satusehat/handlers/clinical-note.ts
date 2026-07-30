import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { buildClinicalImpression } from '../builders/clinical-note'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

export const clinicalNoteHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: note, error } = await supabase
    .from('clinical_notes')
    .select(`*, patients:patient_id ( id, full_name ), encounters:encounter_id ( id, ss_encounter_id ), writer:written_by ( id )`)
    .eq('id', job.local_id)
    .single()
  if (error || !note) throw new Error(`clinical_note ${job.local_id} not found: ${error?.message}`)

  const enc = note.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  const patientIhs = await ensurePatientIhs(supabase, fhir, (note.patients as any).id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, (note.writer as any).id)

  const payload = buildClinicalImpression({
    subjective: note.subjective, objective: note.objective, assessment: note.assessment, plan: note.plan,
    noteDate: note.note_date,
    patientIhs, patientName: (note.patients as any).full_name,
    practitionerIhs, ssEncounterId: enc.ss_encounter_id,
  })
  const res = await fhir.post('/ClinicalImpression', payload)
  await logSync(supabase, {
    resource_type: 'ClinicalImpression', local_id: note.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    const { error: updateErr } = await supabase.from('clinical_notes').update({ ss_sync_status: 'failed' }).eq('id', note.id)
    if (updateErr) console.error('Failed to persist clinical note failed status:', updateErr.message)
    throw new Error(`ClinicalImpression sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }
  const { error: updateErr } = await supabase.from('clinical_notes')
    .update({ ss_clinical_impression_id: res.body.id, ss_sync_status: 'synced' })
    .eq('id', note.id)
  if (updateErr) throw new Error(`Failed to persist ss_clinical_impression_id for clinical_note ${note.id}: ${updateErr.message}`)
}
