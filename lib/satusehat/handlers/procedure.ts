import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { buildProcedure } from '../builders/procedure'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

export const procedureHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: proc, error } = await supabase
    .from('procedures')
    .select(`*, patients:patient_id ( id, full_name ), encounters:encounter_id ( id, ss_encounter_id ), performer:performed_by ( id )`)
    .eq('id', job.local_id)
    .single()
  if (error || !proc) throw new Error(`procedure ${job.local_id} not found: ${error?.message}`)

  const enc = proc.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  const patientIhs = await ensurePatientIhs(supabase, fhir, (proc.patients as any).id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, (proc.performer as any).id)

  const payload = buildProcedure({
    procedureCode: proc.procedure_code, procedureDisplay: proc.procedure_display,
    performedAt: proc.performed_at, notes: proc.notes,
    patientIhs, patientName: (proc.patients as any).full_name, practitionerIhs, ssEncounterId: enc.ss_encounter_id,
  })
  const res = await fhir.post('/Procedure', payload)
  await logSync(supabase, {
    resource_type: 'Procedure', local_id: proc.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    const { error: updateErr } = await supabase.from('procedures').update({ ss_sync_status: 'failed' }).eq('id', proc.id)
    if (updateErr) console.error('Failed to persist procedure failed status:', updateErr.message)
    throw new Error(`Procedure sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }
  const { error: updateErr } = await supabase.from('procedures')
    .update({ ss_procedure_id: res.body.id, ss_sync_status: 'synced' })
    .eq('id', proc.id)
  if (updateErr) throw new Error(`Failed to persist ss_procedure_id for procedure ${proc.id}: ${updateErr.message}`)
}
