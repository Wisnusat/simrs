import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { ssConfig } from '../config'
import { buildServiceRequest, buildDiagnosticReport } from '../builders/lab'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

export const serviceRequestHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: order, error } = await supabase
    .from('lab_orders')
    .select(`
      id, order_date, clinical_notes, ordered_by, ss_service_request_id,
      patients:patient_id ( id, full_name ),
      encounters:encounter_id ( id, ss_encounter_id ),
      lab_order_items ( id, loinc_code, test_name )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !order) throw new Error(`lab_order ${job.local_id} not found: ${error?.message}`)
  if (order.ss_service_request_id) return

  const enc = order.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  const { orgId } = ssConfig()
  const patientIhs = await ensurePatientIhs(supabase, fhir, (order.patients as any).id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, order.ordered_by)

  const payload = buildServiceRequest({
    localId: order.id, orgId, orderDate: order.order_date,
    items: (order.lab_order_items as any[]).map(it => ({ loincCode: it.loinc_code, testName: it.test_name })),
    clinicalNotes: order.clinical_notes,
    patientIhs, patientName: (order.patients as any).full_name, practitionerIhs, ssEncounterId: enc.ss_encounter_id,
  })
  const res = await fhir.post('/ServiceRequest', payload)
  await logSync(supabase, {
    resource_type: 'ServiceRequest', local_id: order.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    const { error: updateErr } = await supabase.from('lab_orders').update({ ss_sync_status: 'failed' }).eq('id', order.id)
    if (updateErr) console.error('Failed to persist service request failed status:', updateErr.message)
    throw new Error(`ServiceRequest sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }
  const { error: updateErr } = await supabase.from('lab_orders')
    .update({ ss_service_request_id: res.body.id, ss_sync_status: 'synced' })
    .eq('id', order.id)
  if (updateErr) throw new Error(`Failed to persist ss_service_request_id for lab_order ${order.id}: ${updateErr.message}`)
}

export const diagnosticReportHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: order, error } = await supabase
    .from('lab_orders')
    .select(`
      id, ss_service_request_id, ss_diagnostic_report_id,
      patients:patient_id ( id, full_name ),
      encounters:encounter_id ( id, ss_encounter_id ),
      lab_order_items ( id, test_name, result_value, result_unit, reference_range, result_entered_at )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !order) throw new Error(`lab_order ${job.local_id} not found: ${error?.message}`)
  if (order.ss_diagnostic_report_id) return

  const enc = order.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  if (!order.ss_service_request_id) throw new DeferSync(`service request for lab_order ${order.id} not yet synced`)
  const { orgId } = ssConfig()
  const patientIhs = await ensurePatientIhs(supabase, fhir, (order.patients as any).id)

  const items = order.lab_order_items as any[]
  const effective = items.find(i => i.result_entered_at)?.result_entered_at ?? new Date().toISOString()
  const payload = buildDiagnosticReport({
    localId: order.id, orgId, effective, ssServiceRequestId: order.ss_service_request_id,
    results: items.map(i => ({ testName: i.test_name, value: i.result_value, unit: i.result_unit, referenceRange: i.reference_range })),
    patientIhs, patientName: (order.patients as any).full_name, ssEncounterId: enc.ss_encounter_id,
  })
  const res = await fhir.post('/DiagnosticReport', payload)
  await logSync(supabase, {
    resource_type: 'DiagnosticReport', local_id: order.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('lab_orders').update({ ss_sync_status: 'failed' }).eq('id', order.id)
    throw new Error(`DiagnosticReport sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }
  const { error: updateErr } = await supabase.from('lab_orders')
    .update({ ss_diagnostic_report_id: res.body?.id, ss_sync_status: 'synced' })
    .eq('id', order.id)
  if (updateErr) throw new Error(`Failed to persist ss_diagnostic_report_id for lab_order ${order.id}: ${updateErr.message}`)
}
