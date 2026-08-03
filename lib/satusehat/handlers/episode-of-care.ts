import type { SyncHandler } from '../worker'
import { ssConfig } from '../config'
import { buildEpisodeOfCare, type EpisodeOfCareInput } from '../builders/episode-of-care'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

export const episodeOfCareHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: ep, error } = await supabase
    .from('episodes_of_care')
    .select(`
      id, status, start_date, end_date, ss_episode_of_care_id,
      patients:patient_id ( id, full_name ),
      dpjp:dpjp_id ( id, full_name )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !ep) throw new Error(`episode_of_care ${job.local_id} not found: ${error?.message}`)

  const patient = ep.patients as any
  const dpjp = ep.dpjp as any
  if (!dpjp) throw new Error(`episode_of_care ${ep.id} has no dpjp assigned`)

  const { orgId } = ssConfig()
  const patientIhs = await ensurePatientIhs(supabase, fhir, patient.id)
  const dpjpIhs = await ensurePractitionerIhs(supabase, fhir, dpjp.id)

  const payload = buildEpisodeOfCare({
    localId: ep.id,
    orgId,
    status: ep.status,
    patientIhs, patientName: patient.full_name,
    dpjpIhs, dpjpName: dpjp.full_name,
    startDate: ep.start_date,
    endDate: ep.end_date ?? null,
  } as EpisodeOfCareInput)

  const res = ep.ss_episode_of_care_id
    ? await fhir.put(`/EpisodeOfCare/${ep.ss_episode_of_care_id}`, { ...payload, id: ep.ss_episode_of_care_id })
    : await fhir.post('/EpisodeOfCare', payload)

  await logSync(supabase, {
    resource_type: 'EpisodeOfCare', local_id: ep.id, ss_resource_id: res.body?.id,
    action: ep.ss_episode_of_care_id ? 'PUT' : 'POST',
    request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('episodes_of_care').update({ ss_sync_status: 'failed' }).eq('id', ep.id)
    throw new Error(`EpisodeOfCare sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }

  const { error: updateErr } = await supabase.from('episodes_of_care').update({
    ss_episode_of_care_id: res.body.id,
    ss_sync_status: 'synced',
    ss_synced_at: new Date().toISOString(),
  }).eq('id', ep.id)
  if (updateErr) throw new Error(`Failed to persist ss_episode_of_care_id for ${ep.id}: ${updateErr.message}`)
}
