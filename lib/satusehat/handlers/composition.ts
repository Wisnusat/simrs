import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { ssConfig } from '../config'
import { buildComposition } from '../builders/composition'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

export const compositionHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: resume, error } = await supabase
    .from('medical_resumes')
    .select(`*, patients:patient_id ( id, full_name ), encounters:encounter_id ( id, ss_encounter_id ), author:authored_by ( id )`)
    .eq('id', job.local_id)
    .single()
  if (error || !resume) throw new Error(`medical_resume ${job.local_id} not found: ${error?.message}`)

  const enc = resume.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  const { orgId } = ssConfig()
  const patientIhs = await ensurePatientIhs(supabase, fhir, (resume.patients as any).id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, (resume.author as any).id)

  const payload = buildComposition({
    localId: resume.id, orgId, resumeDate: resume.resume_date,
    chiefComplaint: resume.chief_complaint, historyOfIllness: resume.history_of_illness,
    physicalExamination: resume.physical_examination, summary: resume.summary, followUpPlan: resume.follow_up_plan,
    patientIhs, patientName: (resume.patients as any).full_name, practitionerIhs, ssEncounterId: enc.ss_encounter_id,
  })
  const res = await fhir.post('/Composition', payload)
  await logSync(supabase, {
    resource_type: 'Composition', local_id: resume.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    const { error: updateErr } = await supabase.from('medical_resumes').update({ ss_sync_status: 'failed' }).eq('id', resume.id)
    if (updateErr) console.error('Failed to persist composition failed status:', updateErr.message)
    throw new Error(`Composition sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }
  const { error: updateErr } = await supabase.from('medical_resumes').update({
    ss_composition_id: res.body.id, ss_sync_status: 'synced', ss_synced_at: new Date().toISOString(),
  }).eq('id', resume.id)
  if (updateErr) throw new Error(`Failed to persist ss_composition_id for medical_resume ${resume.id}: ${updateErr.message}`)
}
