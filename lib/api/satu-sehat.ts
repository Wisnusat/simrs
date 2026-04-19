/**
 * lib/api/satu-sehat.ts
 *
 * Mock Satu Sehat (FHIR R4) integration.
 * Each function fires-and-forgets: it logs to ss_sync_logs but never throws,
 * so a sync failure never blocks the clinical workflow.
 */

import { SupabaseClient } from '@supabase/supabase-js'

type SyncAction = 'POST' | 'PUT' | 'PATCH'

interface SyncLogEntry {
  resource_type: string
  local_id: string
  ss_resource_id?: string
  action: SyncAction
  request_payload: Record<string, unknown>
  response_payload: Record<string, unknown>
  http_status: number
  status: 'success' | 'failed'
  error_message?: string
}

async function logSync(supabase: SupabaseClient, entry: SyncLogEntry) {
  try {
    await supabase.from('ss_sync_logs').insert(entry)
  } catch {
    // Swallow — logging failure must never surface to caller
  }
}

/** Simulates a mock FHIR call and returns a fake resource ID */
function mockFhirCall(resourceType: string): { id: string; resourceType: string } {
  return {
    id: `ss-${resourceType.toLowerCase()}-${crypto.randomUUID()}`,
    resourceType,
  }
}

// ---------------------------------------------------------------------------
// Public sync functions — each is safe to call without await
// ---------------------------------------------------------------------------

export async function syncEncounter(
  supabase: SupabaseClient,
  encounterId: string,
  payload: Record<string, unknown> = {},
) {
  const response = mockFhirCall('Encounter')
  await supabase
    .from('encounters')
    .update({ ss_encounter_id: response.id, ss_sync_status: 'synced', ss_synced_at: new Date().toISOString() })
    .eq('id', encounterId)
  await logSync(supabase, {
    resource_type: 'Encounter',
    local_id: encounterId,
    ss_resource_id: response.id,
    action: 'POST',
    request_payload: { resourceType: 'Encounter', ...payload },
    response_payload: response,
    http_status: 201,
    status: 'success',
  })
}

export async function syncVitalSigns(
  supabase: SupabaseClient,
  vitalSignId: string,
  payload: Record<string, unknown> = {},
) {
  const response = mockFhirCall('Observation')
  await supabase
    .from('vital_signs')
    .update({ ss_observation_id: response.id, ss_sync_status: 'synced' })
    .eq('id', vitalSignId)
  await logSync(supabase, {
    resource_type: 'Observation',
    local_id: vitalSignId,
    ss_resource_id: response.id,
    action: 'POST',
    request_payload: { resourceType: 'Observation', ...payload },
    response_payload: response,
    http_status: 201,
    status: 'success',
  })
}

export async function syncDiagnosis(
  supabase: SupabaseClient,
  diagnosisId: string,
  payload: Record<string, unknown> = {},
) {
  const response = mockFhirCall('Condition')
  await supabase
    .from('diagnoses')
    .update({ ss_condition_id: response.id, ss_sync_status: 'synced' })
    .eq('id', diagnosisId)
  await logSync(supabase, {
    resource_type: 'Condition',
    local_id: diagnosisId,
    ss_resource_id: response.id,
    action: 'POST',
    request_payload: { resourceType: 'Condition', ...payload },
    response_payload: response,
    http_status: 201,
    status: 'success',
  })
}

export async function syncClinicalNote(
  supabase: SupabaseClient,
  noteId: string,
  payload: Record<string, unknown> = {},
) {
  const response = mockFhirCall('ClinicalImpression')
  await supabase
    .from('clinical_notes')
    .update({ ss_clinical_impression_id: response.id, ss_sync_status: 'synced' })
    .eq('id', noteId)
  await logSync(supabase, {
    resource_type: 'ClinicalImpression',
    local_id: noteId,
    ss_resource_id: response.id,
    action: 'POST',
    request_payload: { resourceType: 'ClinicalImpression', ...payload },
    response_payload: response,
    http_status: 201,
    status: 'success',
  })
}

export async function syncPrescription(
  supabase: SupabaseClient,
  prescriptionId: string,
  payload: Record<string, unknown> = {},
) {
  const response = mockFhirCall('MedicationRequest')
  await supabase
    .from('prescriptions')
    .update({ ss_medication_request_id: response.id, ss_sync_status: 'synced' })
    .eq('id', prescriptionId)
  await logSync(supabase, {
    resource_type: 'MedicationRequest',
    local_id: prescriptionId,
    ss_resource_id: response.id,
    action: 'POST',
    request_payload: { resourceType: 'MedicationRequest', ...payload },
    response_payload: response,
    http_status: 201,
    status: 'success',
  })
}

export async function syncDispense(
  supabase: SupabaseClient,
  dispenseId: string,
  payload: Record<string, unknown> = {},
) {
  const response = mockFhirCall('MedicationDispense')
  await supabase
    .from('medication_dispenses')
    .update({ ss_medication_dispense_id: response.id, ss_sync_status: 'synced' })
    .eq('id', dispenseId)
  await logSync(supabase, {
    resource_type: 'MedicationDispense',
    local_id: dispenseId,
    ss_resource_id: response.id,
    action: 'POST',
    request_payload: { resourceType: 'MedicationDispense', ...payload },
    response_payload: response,
    http_status: 201,
    status: 'success',
  })
}

export async function syncInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  payload: Record<string, unknown> = {},
) {
  const response = mockFhirCall('Invoice')
  await supabase
    .from('invoices')
    .update({ ss_invoice_id: response.id, ss_sync_status: 'synced' })
    .eq('id', invoiceId)
  await logSync(supabase, {
    resource_type: 'Invoice',
    local_id: invoiceId,
    ss_resource_id: response.id,
    action: 'POST',
    request_payload: { resourceType: 'Invoice', ...payload },
    response_payload: response,
    http_status: 201,
    status: 'success',
  })
}
