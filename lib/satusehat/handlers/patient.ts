import type { SyncHandler } from '../worker'
import { lookupPatientByNik, ensurePatientIhs } from '../patient-service'

export const patientHandler: SyncHandler = async (supabase, fhir, job) => {
  // determine path for accurate audit logging: was the patient already on SATUSEHAT?
  const { data: pat } = await supabase
    .from('patients').select('nik, ss_ihs_number').eq('id', job.local_id).single()
  const preResolved = !!pat?.ss_ihs_number
  const foundRemote = !preResolved && pat?.nik
    ? (await lookupPatientByNik(fhir, pat.nik)) !== null
    : preResolved

  const ihs = await ensurePatientIhs(supabase, fhir, job.local_id)

  await supabase.from('ss_sync_logs').insert({
    resource_type: 'Patient', local_id: job.local_id, ss_resource_id: ihs,
    action: foundRemote || preResolved ? 'GET' : 'POST',
    request_payload: {}, response_payload: { ihs },
    http_status: foundRemote || preResolved ? 200 : 201, status: 'success',
  })
}
