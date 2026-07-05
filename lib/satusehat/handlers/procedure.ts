import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { buildProcedure, type SurgeryPerformer } from '../builders/procedure'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

export const procedureHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: proc, error } = await supabase
    .from('procedures')
    .select(`
      id, procedure_code, procedure_display, performed_at, notes, is_surgery, ss_procedure_id,
      patients:patient_id ( id, full_name ),
      encounters:encounter_id ( id, ss_encounter_id ),
      performer:performed_by ( id )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !proc) throw new Error(`procedure ${job.local_id} not found: ${error?.message}`)

  const enc = proc.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)

  const patientIhs = await ensurePatientIhs(supabase, fhir, (proc.patients as any).id)

  let performedEnd: string | null = null
  let performers: SurgeryPerformer[] | undefined
  let surgeryRequestId: string | null = null

  if (proc.is_surgery) {
    // Fetch surgery_request for timing + team
    const { data: sr } = await supabase
      .from('surgery_requests')
      .select('id, surgery_start_at, surgery_end_at')
      .eq('encounter_id', enc.id)
      .eq('patient_id', (proc.patients as any).id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (sr) {
      surgeryRequestId = sr.id
      if (sr.surgery_start_at) {
        // Override performedAt with surgery_start_at, set end
        ;(proc as any).performed_at = sr.surgery_start_at
        performedEnd = sr.surgery_end_at ?? null
      }

      // Fetch team
      const { data: spRows } = await supabase
        .from('surgery_performers')
        .select('practitioner_id, display_name, snomed_role_code, snomed_role_display')
        .eq('surgery_request_id', sr.id)
        .order('sort_order')

      if (spRows?.length) {
        const built: SurgeryPerformer[] = []
        for (const sp of spRows) {
          if (!sp.practitioner_id) {
            // No linked practitioner — include as display-only if we can't get IHS
            continue
          }
          try {
            const ihs = await ensurePractitionerIhs(supabase, fhir, sp.practitioner_id)
            built.push({
              ihs,
              name: sp.display_name,
              snomedCode: sp.snomed_role_code || null,
              snomedDisplay: sp.snomed_role_display || null,
            })
          } catch {
            // Practitioner IHS not resolvable — skip, don't fail the whole sync
          }
        }
        if (built.length) performers = built
      }
    }

    // Fallback to single performer from performed_by if team resolution failed
    if (!performers) {
      const ihs = await ensurePractitionerIhs(supabase, fhir, (proc.performer as any).id)
      performers = [{ ihs, name: undefined, snomedCode: '304292004', snomedDisplay: 'Responsible observer' }]
    }
  } else {
    await ensurePractitionerIhs(supabase, fhir, (proc.performer as any).id)
  }

  const payload = buildProcedure({
    procedureCode: proc.procedure_code,
    procedureDisplay: proc.procedure_display,
    performedAt: proc.performed_at,
    performedEnd,
    notes: proc.notes,
    patientIhs, patientName: (proc.patients as any).full_name,
    practitionerIhs: proc.is_surgery ? undefined : (proc.performer as any).id,
    ssEncounterId: enc.ss_encounter_id,
    performers,
  })

  const res = proc.ss_procedure_id
    ? await fhir.put(`/Procedure/${proc.ss_procedure_id}`, { ...payload, id: proc.ss_procedure_id })
    : await fhir.post('/Procedure', payload)

  await logSync(supabase, {
    resource_type: 'Procedure', local_id: proc.id, ss_resource_id: res.body?.id,
    action: proc.ss_procedure_id ? 'PUT' : 'POST',
    request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('procedures').update({ ss_sync_status: 'failed' }).eq('id', proc.id)
    throw new Error(`Procedure sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }

  const { error: updateErr } = await supabase.from('procedures').update({
    ss_procedure_id: res.body.id,
    ss_sync_status: 'synced',
  }).eq('id', proc.id)
  if (updateErr) throw new Error(`Failed to persist ss_procedure_id for ${proc.id}: ${updateErr.message}`)

  // Write-back ss_procedure_id to surgery_requests so dashboard badge is real
  if (proc.is_surgery && surgeryRequestId) {
    await supabase.from('surgery_requests').update({
      ss_procedure_id: res.body.id,
      ss_sync_status: 'synced',
    }).eq('id', surgeryRequestId)
  }
}
