import { SupabaseClient } from '@supabase/supabase-js'
import type { FhirClient } from '../client'
import { ssConfig } from '../config'

/** Get (or lazily create) the SATUSEHAT Location for a local locations row. */
export async function ensureLocationSsId(
  supabase: SupabaseClient,
  fhir: FhirClient,
  locationId: string,
): Promise<{ id: string; name: string }> {
  const { data: loc, error } = await supabase
    .from('locations').select('id, name, ss_location_id').eq('id', locationId).single()
  if (error || !loc) throw new Error(`location ${locationId} not found: ${error?.message}`)
  if (loc.ss_location_id) return { id: loc.ss_location_id, name: loc.name }

  const { orgId } = ssConfig()
  const res = await fhir.post('/Location', {
    resourceType: 'Location',
    identifier: [{ system: `http://sys-ids.kemkes.go.id/location/${orgId}`, value: loc.id }],
    status: 'active',
    name: loc.name,
    mode: 'instance',
    physicalType: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'ro', display: 'Room' }],
    },
    managingOrganization: { reference: `Organization/${orgId}` },
  })
  if (!res.ok) throw new Error(`Location create failed ${res.status}: ${JSON.stringify(res.body)}`)
  const ssId = res.body?.id
  const { error: updateErr } = await supabase
    .from('locations').update({ ss_location_id: ssId }).eq('id', locationId)
  if (updateErr) throw new Error(`Failed to persist ss_location_id for location ${locationId}: ${updateErr.message}`)
  return { id: ssId, name: loc.name }
}

/** Shared ss_sync_logs writer for handlers. */
export async function logSync(supabase: SupabaseClient, entry: {
  resource_type: string; local_id: string; ss_resource_id?: string
  action: string; request_payload: unknown; response_payload: unknown
  http_status: number; status: 'success' | 'failed'; error_message?: string
}) {
  try { await supabase.from('ss_sync_logs').insert(entry) } catch { /* never surface */ }
}
