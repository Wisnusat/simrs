import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'
import { enqueueSync } from '@/lib/satusehat/queue'

/**
 * POST /api/prescriptions
 * Doctor creates a prescription with one or more line items.
 * Stock is checked but insufficient stock does NOT block creation — a warning is returned.
 *
 * Body: {
 *   encounter_id, patient_id,
 *   items: [{ medication_id, dosage, frequency?, duration_days?, quantity, instructions? }]
 * }
 *
 * GET /api/prescriptions
 * Query params (all optional):
 *   encounter_id   filter by encounter
 *   status         filter by status (active | completed | cancelled)
 *   today          "1" to restrict to today's prescriptions
 *
 * Results are enriched with per-item stock_available for the pharmacist view.
 */

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, 'prescriptions:post', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth

  if (!['doctor', 'admin'].includes(practitioner.role))
    return apiResponse.forbidden('Only doctors can write prescriptions')

  const { encounter_id, patient_id, items } = await req.json()

  if (!encounter_id || !patient_id || !items?.length)
    return apiResponse.badRequest('encounter_id, patient_id, and at least one item are required')

  // Create prescription header
  const { data: prescription, error: rxError } = await supabase
    .from('prescriptions')
    .insert({ encounter_id, patient_id, prescribed_by: practitioner.id, status: 'active' })
    .select()
    .single()

  if (rxError) return apiResponse.serverError(rxError.message)

  // Insert items
  const { data: rxItems, error: itemsError } = await supabase
    .from('prescription_items')
    .insert(
      (items as any[]).map((item) => ({
        prescription_id: (prescription as any).id,
        medication_id: item.medication_id,
        dosage: item.dosage,
        frequency: item.frequency ?? null,
        duration_days: item.duration_days ?? null,
        quantity: item.quantity,
        instructions: item.instructions ?? null,
        is_dispensed: false,
      }))
    )
    .select()

  if (itemsError) {
    // Rollback: delete orphaned prescription header
    await supabase.from('prescriptions').delete().eq('id', (prescription as any).id)
    return apiResponse.serverError(itemsError.message)
  }

  // Stock check — warn only, never block
  const { data: stocks } = await supabase
    .from('medication_stock')
    .select('medication_id, quantity')
    .in('medication_id', (items as any[]).map((i) => i.medication_id))
    .eq('organization_id', practitioner.organization_id)

  const stockMap = new Map((stocks ?? []).map((s: any) => [s.medication_id, s.quantity]))
  const stock_warnings: string[] = (items as any[])
    .filter((item) => (stockMap.get(item.medication_id) ?? 0) < item.quantity)
    .map((item) => `Stok obat ID ${item.medication_id} tidak mencukupi`)

  for (const item of (rxItems ?? [])) {
    enqueueSync(supabase, 'MedicationRequest', (item as any).id).catch(() => {})
  }

  return apiResponse.created({
    prescription: { ...prescription, prescription_items: rxItems },
    stock_warnings,
  })
}

export async function GET(req: NextRequest) {
  const rl = await rateLimit(req, 'prescriptions:get', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { practitioner } = auth
  const { searchParams } = new URL(req.url)
  const encounterId = searchParams.get('encounter_id')
  const status = searchParams.get('status')
  const today = searchParams.get('today')

  let query = supabase
    .from('prescriptions')
    .select(`
      *,
      patients ( full_name, medical_record_no ),
      practitioners ( full_name ),
      encounters ( encounter_class ),
      prescription_items (
        *,
        medications ( id, name, generic_name, form, strength, unit )
      )
    `)
    .order('prescription_date', { ascending: false })

  if (encounterId) query = query.eq('encounter_id', encounterId)
  if (status) query = query.eq('status', status)
  if (today === '1') {
    const d = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
    query = query.gte('prescription_date', d)
  }

  const { data, error } = await query
  if (error) return apiResponse.serverError(error.message)

  // Enrich with aggregated stock
  const allMedIds = (data ?? []).flatMap((rx: any) =>
    (rx.prescription_items ?? []).map((i: any) => i.medication_id)
  )
  const { data: stocks } = await supabase
    .from('medication_stock')
    .select('medication_id, quantity')
    .in('medication_id', allMedIds.length > 0 ? allMedIds : ['__none__'])
    .eq('organization_id', practitioner.organization_id)

  const stockMap = new Map<string, number>()
  for (const s of stocks ?? []) {
    stockMap.set((s as any).medication_id, (stockMap.get((s as any).medication_id) ?? 0) + (s as any).quantity)
  }

  return apiResponse.ok(
    (data ?? []).map((rx: any) => ({
      ...rx,
      encounter_class: rx.encounters?.encounter_class ?? null,
      encounters: undefined,
      prescription_items: (rx.prescription_items ?? []).map((item: any) => ({
        ...item,
        stock_available: stockMap.get(item.medication_id) ?? 0,
      })),
    }))
  )
}
