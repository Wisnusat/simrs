import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { ssConfig } from '../config'
import { buildMedicationRequest, buildMedicationDispense } from '../builders/medication'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

// job.local_id = prescription_items.id
export const medicationRequestHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: item, error } = await supabase
    .from('prescription_items')
    .select(`
      id, dosage, frequency, instructions, ss_medication_request_id,
      medications:medication_id ( id, name, kfa_code ),
      prescriptions:prescription_id (
        id, prescription_date, prescribed_by,
        patients:patient_id ( id, full_name ),
        encounters:encounter_id ( id, ss_encounter_id )
      )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !item) throw new Error(`prescription_item ${job.local_id} not found: ${error?.message}`)

  const existingId = item.ss_medication_request_id as string | null
  const rx = item.prescriptions as any
  const enc = rx.encounters
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)

  const { orgId } = ssConfig()
  const med = item.medications as any
  const patientIhs = await ensurePatientIhs(supabase, fhir, rx.patients.id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, rx.prescribed_by)

  const payload = buildMedicationRequest({
    prescriptionId: rx.id, itemId: item.id, orgId,
    medication: { localId: med.id, kfaCode: med.kfa_code, name: med.name },
    dosage: item.dosage, frequency: item.frequency, instructions: item.instructions,
    authoredOn: rx.prescription_date,
    patientIhs, patientName: rx.patients.full_name, practitionerIhs, ssEncounterId: enc.ss_encounter_id,
  })
  const action = existingId ? 'PUT' : 'POST'
  const res = existingId
    ? await fhir.put(`/MedicationRequest/${existingId}`, { ...payload, id: existingId })
    : await fhir.post('/MedicationRequest', payload)

  await logSync(supabase, {
    resource_type: 'MedicationRequest', local_id: item.id, ss_resource_id: res.body?.id ?? existingId ?? undefined,
    action, request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('prescription_items').update({ ss_sync_status: 'failed' }).eq('id', item.id)
    throw new Error(`MedicationRequest sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }

  const newSsId = res.body?.id ?? existingId
  const { error: updateErr } = await supabase.from('prescription_items')
    .update({ ss_medication_request_id: newSsId, ss_sync_status: 'synced' })
    .eq('id', item.id)
  if (updateErr) throw new Error(`Failed to persist ss_medication_request_id for prescription_item ${item.id}: ${updateErr.message}`)

  // Mark header synced when all items done
  if (!existingId) {
    const { data: remaining } = await supabase
      .from('prescription_items').select('id').eq('prescription_id', rx.id).neq('ss_sync_status', 'synced')
    if (!remaining?.length) {
      await supabase.from('prescriptions')
        .update({ ss_medication_request_id: newSsId, ss_sync_status: 'synced' })
        .eq('id', rx.id)
    }
  }
}

// job.local_id = medication_dispenses.id
export const medicationDispenseHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: disp, error } = await supabase
    .from('medication_dispenses')
    .select(`
      id, quantity_dispensed, dispensed_at, dispensed_by, ss_medication_dispense_id,
      medications:medication_id ( id, name, kfa_code ),
      patients:patient_id ( id, full_name ),
      encounters:encounter_id ( id, ss_encounter_id ),
      items:prescription_item_id ( id, ss_medication_request_id )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !disp) throw new Error(`dispense ${job.local_id} not found: ${error?.message}`)

  const existingId = disp.ss_medication_dispense_id as string | null
  const enc = disp.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  const item = disp.items as any
  if (!item?.ss_medication_request_id) throw new DeferSync(`prescription item ${item?.id} not yet synced`)

  const { orgId } = ssConfig()
  const med = disp.medications as any
  const patientIhs = await ensurePatientIhs(supabase, fhir, (disp.patients as any).id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, disp.dispensed_by)

  const payload = buildMedicationDispense({
    localId: disp.id, orgId,
    medication: { localId: med.id, kfaCode: med.kfa_code, name: med.name },
    ssMedicationRequestId: item.ss_medication_request_id,
    quantity: disp.quantity_dispensed, whenHandedOver: disp.dispensed_at,
    patientIhs, patientName: (disp.patients as any).full_name, practitionerIhs, ssEncounterId: enc.ss_encounter_id,
  })
  const action = existingId ? 'PUT' : 'POST'
  const res = existingId
    ? await fhir.put(`/MedicationDispense/${existingId}`, { ...payload, id: existingId })
    : await fhir.post('/MedicationDispense', payload)

  await logSync(supabase, {
    resource_type: 'MedicationDispense', local_id: disp.id, ss_resource_id: res.body?.id ?? existingId ?? undefined,
    action, request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('medication_dispenses').update({ ss_sync_status: 'failed' }).eq('id', disp.id)
    throw new Error(`MedicationDispense sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }

  const { error: updateErr } = await supabase.from('medication_dispenses')
    .update({ ss_medication_dispense_id: res.body?.id ?? existingId, ss_sync_status: 'synced' })
    .eq('id', disp.id)
  if (updateErr) throw new Error(`Failed to persist ss_medication_dispense_id for dispense ${disp.id}: ${updateErr.message}`)
}
