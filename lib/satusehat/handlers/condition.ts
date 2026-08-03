import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { buildCondition } from '../builders/condition'
import { ensurePatientIhs } from '../patient-service'
import { logSync } from './helpers'

export const conditionHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: dx, error } = await supabase
    .from('diagnoses')
    .select(`*, patients:patient_id ( id, full_name ), encounters:encounter_id ( id, ss_encounter_id )`)
    .eq('id', job.local_id)
    .single()
  if (error || !dx) throw new Error(`diagnosis ${job.local_id} not found: ${error?.message}`)

  const enc = dx.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  const patientIhs = await ensurePatientIhs(supabase, fhir, (dx.patients as any).id)

  const payload = buildCondition({
    icd10Code: dx.icd10_code, icd10Display: dx.icd10_display,
    clinicalStatus: dx.clinical_status, onsetDate: dx.onset_date,
    patientIhs, patientName: (dx.patients as any).full_name,
    ssEncounterId: enc.ss_encounter_id,
  })
  const res = await fhir.post('/Condition', payload)
  await logSync(supabase, {
    resource_type: 'Condition', local_id: dx.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    const { error: updateErr } = await supabase.from('diagnoses').update({ ss_sync_status: 'failed' }).eq('id', dx.id)
    if (updateErr) console.error('Failed to persist condition failed status:', updateErr.message)
    throw new Error(`Condition sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }
  const { error: updateErr } = await supabase.from('diagnoses')
    .update({ ss_condition_id: res.body.id, ss_sync_status: 'synced' })
    .eq('id', dx.id)
  if (updateErr) throw new Error(`Failed to persist ss_condition_id for diagnosis ${dx.id}: ${updateErr.message}`)
}
