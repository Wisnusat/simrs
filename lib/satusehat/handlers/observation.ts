import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { buildVitalObservations } from '../builders/observation'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

export const observationHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: vs, error } = await supabase
    .from('vital_signs')
    .select(`*, patients:patient_id ( id, full_name ), encounters:encounter_id ( id, ss_encounter_id ), recorder:recorded_by ( id )`)
    .eq('id', job.local_id)
    .single()
  if (error || !vs) throw new Error(`vital_signs ${job.local_id} not found: ${error?.message}`)

  const enc = vs.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)

  const patientIhs = await ensurePatientIhs(supabase, fhir, (vs.patients as any).id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, (vs.recorder as any).id)

  const observations = buildVitalObservations(vs, {
    patientIhs, patientName: (vs.patients as any).full_name,
    practitionerIhs, ssEncounterId: enc.ss_encounter_id,
  })

  // Resume partially-synced rows: skip LOINCs already in the jsonb map
  const idMap: Record<string, string> = (vs.ss_observation_id as Record<string, string>) ?? {}
  for (const { loinc, payload } of observations) {
    if (idMap[loinc]) continue
    const res = await fhir.post('/Observation', payload)
    await logSync(supabase, {
      resource_type: 'Observation', local_id: vs.id, ss_resource_id: res.body?.id,
      action: 'POST', request_payload: payload, response_payload: res.body ?? {},
      http_status: res.status, status: res.ok ? 'success' : 'failed',
      ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
    })
    if (!res.ok) {
      const { error: updateErr } = await supabase
        .from('vital_signs').update({ ss_observation_id: idMap, ss_sync_status: 'failed' }).eq('id', vs.id)
      if (updateErr) console.error('Failed to persist partial observation map:', updateErr.message)
      throw new Error(`Observation ${loinc} failed ${res.status}: ${JSON.stringify(res.body)}`)
    }
    idMap[loinc] = res.body.id
  }

  const { error: updateErr } = await supabase.from('vital_signs')
    .update({ ss_observation_id: idMap, ss_sync_status: 'synced' })
    .eq('id', vs.id)
  if (updateErr) throw new Error(`Failed to persist ss_observation_id for vital_signs ${vs.id}: ${updateErr.message}`)
}
