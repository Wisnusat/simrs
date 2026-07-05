import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { ssConfig } from '../config'
import { buildNutritionOrder, type NutritionOrderInput } from '../builders/nutrition-order'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

export const nutritionOrderHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: no, error } = await supabase
    .from('nutrition_orders')
    .select(`
      id, is_active, order_date, dietary_restrictions, energy_needs_kcal, protein_needs_g, notes,
      ss_nutrition_order_id, encounter_id,
      patients:patient_id ( id, full_name ),
      nutritionist:nutritionist_id ( id, full_name )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !no) throw new Error(`nutrition_order ${job.local_id} not found: ${error?.message}`)

  const patient = no.patients as any
  const nutritionist = no.nutritionist as any

  // Resolve encounter SS id if linked
  let ssEncounterId: string | null = null
  if (no.encounter_id) {
    const { data: enc } = await supabase
      .from('encounters').select('ss_encounter_id').eq('id', no.encounter_id).single()
    if (!enc?.ss_encounter_id) throw new DeferSync(`Encounter ${no.encounter_id} not yet synced`)
    ssEncounterId = enc.ss_encounter_id
  }

  const { orgId } = ssConfig()
  const patientIhs = await ensurePatientIhs(supabase, fhir, patient.id)
  const nutritionistIhs = await ensurePractitionerIhs(supabase, fhir, nutritionist.id)

  const payload = buildNutritionOrder({
    localId: no.id, orgId,
    isActive: no.is_active,
    patientIhs, patientName: patient.full_name,
    nutritionistIhs, nutritionistName: nutritionist.full_name,
    ssEncounterId,
    orderDate: no.order_date,
    dietaryRestrictions: no.dietary_restrictions ?? null,
    energyKcal: no.energy_needs_kcal ?? null,
    proteinG: no.protein_needs_g ?? null,
    notes: no.notes ?? null,
  } as NutritionOrderInput)

  const res = no.ss_nutrition_order_id
    ? await fhir.put(`/NutritionOrder/${no.ss_nutrition_order_id}`, { ...payload, id: no.ss_nutrition_order_id })
    : await fhir.post('/NutritionOrder', payload)

  await logSync(supabase, {
    resource_type: 'NutritionOrder', local_id: no.id, ss_resource_id: res.body?.id,
    action: no.ss_nutrition_order_id ? 'PUT' : 'POST',
    request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('nutrition_orders').update({ ss_sync_status: 'failed' }).eq('id', no.id)
    throw new Error(`NutritionOrder sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }

  const { error: updateErr } = await supabase.from('nutrition_orders').update({
    ss_nutrition_order_id: res.body.id,
    ss_sync_status: 'synced',
  }).eq('id', no.id)
  if (updateErr) throw new Error(`Failed to persist ss_nutrition_order_id for ${no.id}: ${updateErr.message}`)
}
