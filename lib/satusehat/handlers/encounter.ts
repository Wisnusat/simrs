import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { ssConfig } from '../config'
import { buildEncounter, type EncounterInput } from '../builders/encounter'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { ensureLocationSsId, logSync } from './helpers'

export const encounterHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: enc, error } = await supabase
    .from('encounters')
    .select(`
      id, encounter_class, status, arrived_at, started_at, finished_at,
      location_id, ss_encounter_id, episode_of_care_id,
      patients:patient_id ( id, full_name ),
      doctor:doctor_id ( id, full_name ),
      nurse:nurse_id ( id, full_name )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !enc) throw new Error(`encounter ${job.local_id} not found: ${error?.message}`)

  const patient = enc.patients as any
  const practitionerRow = (enc.doctor ?? enc.nurse) as any
  if (!practitionerRow) throw new Error(`encounter ${enc.id} has no doctor or nurse`)
  if (!enc.location_id) throw new Error(`encounter ${enc.id} has no location`)

  // For inpatient encounters that belong to an episode, DeferSync until episode is synced
  let ssEpisodeOfCareId: string | undefined
  if (enc.episode_of_care_id) {
    const { data: ep } = await supabase
      .from('episodes_of_care')
      .select('ss_episode_of_care_id')
      .eq('id', enc.episode_of_care_id)
      .single()
    if (!ep?.ss_episode_of_care_id) {
      throw new DeferSync(`EpisodeOfCare ${enc.episode_of_care_id} not yet synced`)
    }
    ssEpisodeOfCareId = ep.ss_episode_of_care_id
  }

  const { orgId } = ssConfig()
  const patientIhs = await ensurePatientIhs(supabase, fhir, patient.id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, practitionerRow.id)
  const loc = await ensureLocationSsId(supabase, fhir, enc.location_id)

  const payload = buildEncounter({
    localId: enc.id,
    orgId,
    encClass: enc.encounter_class,
    status: enc.status === 'finished' ? 'finished' : enc.status === 'in_progress' ? 'in_progress' : 'arrived',
    patientIhs, patientName: patient.full_name,
    practitionerIhs, practitionerName: practitionerRow.full_name,
    ssLocationId: loc.id, locationName: loc.name,
    arrivedAt: enc.arrived_at, startedAt: enc.started_at, finishedAt: enc.finished_at,
    ssEpisodeOfCareId,
  } as EncounterInput)

  // Update-in-place if already synced (finish flow), else create
  const res = enc.ss_encounter_id
    ? await fhir.put(`/Encounter/${enc.ss_encounter_id}`, { ...payload, id: enc.ss_encounter_id })
    : await fhir.post('/Encounter', payload)

  await logSync(supabase, {
    resource_type: 'Encounter', local_id: enc.id, ss_resource_id: res.body?.id,
    action: enc.ss_encounter_id ? 'PUT' : 'POST',
    request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('encounters').update({ ss_sync_status: 'failed' }).eq('id', enc.id)
    throw new Error(`Encounter sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }

  await supabase.from('encounters').update({
    ss_encounter_id: res.body.id,
    ss_sync_status: 'synced',
    ss_synced_at: new Date().toISOString(),
  }).eq('id', enc.id)
}
