import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { buildCondition } from '../builders/condition'
import { ensurePatientIhs } from '../patient-service'
import { logSync } from './helpers'

export const conditionHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: dx, error } = await supabase
    .from('diagnoses')
    .select(`
      id, icd10_code, icd10_display, clinical_status, onset_date, ss_condition_id,
      patients:patient_id ( id, full_name ),
      encounters:encounter_id ( id, ss_encounter_id )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !dx) throw new Error(`diagnosis ${job.local_id} not found: ${error?.message}`)

  const enc = dx.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  const patientIhs = await ensurePatientIhs(supabase, fhir, (dx.patients as any).id)

  const payload = buildCondition({
    icd10Code: dx.icd10_code,
    icd10Display: dx.icd10_display,
    clinicalStatus: dx.clinical_status,
    onsetDate: dx.onset_date,
    patientIhs,
    patientName: (dx.patients as any).full_name,
    ssEncounterId: enc.ss_encounter_id,
  })

  const existingId = (dx as any).ss_condition_id as string | null
  const action = existingId ? 'PUT' : 'POST'
  const res = existingId
    ? await fhir.put(`/Condition/${existingId}`, { ...payload, id: existingId })
    : await fhir.post('/Condition', payload)

  await logSync(supabase, {
    resource_type: 'Condition', local_id: dx.id, ss_resource_id: res.body?.id ?? existingId ?? undefined,
    action, request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })

  if (!res.ok) {
    await supabase.from('diagnoses').update({ ss_sync_status: 'failed' }).eq('id', dx.id)
    throw new Error(`Condition sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }

  const { error: updateErr } = await supabase.from('diagnoses')
    .update({ ss_condition_id: res.body?.id ?? existingId, ss_sync_status: 'synced' })
    .eq('id', dx.id)
  if (updateErr) throw new Error(`Failed to persist ss_condition_id for diagnosis ${dx.id}: ${updateErr.message}`)
}
