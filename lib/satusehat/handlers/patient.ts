import type { SyncHandler } from '../worker'
import { ensurePatientIhs } from '../patient-service'

export const patientHandler: SyncHandler = async (supabase, fhir, job) => {
  const ihs = await ensurePatientIhs(supabase, fhir, job.local_id)
  await supabase.from('ss_sync_logs').insert({
    resource_type: 'Patient', local_id: job.local_id, ss_resource_id: ihs,
    action: 'POST', request_payload: {}, response_payload: { ihs },
    http_status: 200, status: 'success',
  })
}
