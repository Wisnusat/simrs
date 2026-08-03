import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { ssConfig } from '../config'
import { buildReferralServiceRequest } from '../builders/referral'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

// job.local_id = referrals.id
export const referralHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: ref, error } = await supabase
    .from('referrals')
    .select(`
      id, referral_date, urgency, destination_facility_name, destination_specialty,
      referral_reason, ss_service_request_id, ss_destination_org_id,
      patients:patient_id ( id, full_name ),
      encounters:encounter_id ( id, ss_encounter_id ),
      requester:referred_by ( id )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !ref) throw new Error(`referral ${job.local_id} not found: ${error?.message}`)

  const enc = ref.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)

  const { orgId } = ssConfig()
  const existingId = (ref as any).ss_service_request_id as string | null
  const patientIhs = await ensurePatientIhs(supabase, fhir, (ref.patients as any).id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, (ref.requester as any).id)

  const payload = buildReferralServiceRequest({
    localId: ref.id,
    orgId,
    referralDate: ref.referral_date,
    urgency: ref.urgency,
    destinationFacilityName: ref.destination_facility_name,
    destinationSpecialty: ref.destination_specialty,
    referralReason: ref.referral_reason,
    ssDestinationOrgId: (ref as any).ss_destination_org_id ?? null,
    patientIhs,
    patientName: (ref.patients as any).full_name,
    practitionerIhs,
    ssEncounterId: enc.ss_encounter_id,
  })

  const action = existingId ? 'PUT' : 'POST'
  const res = existingId
    ? await fhir.put(`/ServiceRequest/${existingId}`, { ...payload, id: existingId })
    : await fhir.post('/ServiceRequest', payload)

  await logSync(supabase, {
    resource_type: 'ServiceRequest', local_id: ref.id, ss_resource_id: res.body?.id ?? existingId ?? undefined,
    action, request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })

  if (!res.ok) {
    await supabase.from('referrals').update({ ss_sync_status: 'failed' }).eq('id', ref.id)
    throw new Error(`Referral ServiceRequest sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }

  const { error: updateErr } = await supabase.from('referrals')
    .update({ ss_service_request_id: res.body?.id ?? existingId, ss_sync_status: 'synced' })
    .eq('id', ref.id)
  if (updateErr) throw new Error(`Failed to persist ss_service_request_id for referral ${ref.id}: ${updateErr.message}`)
}
