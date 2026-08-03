import { SupabaseClient } from '@supabase/supabase-js'
import type { FhirClient } from './client'
import { FHIR } from './config'

/**
 * Returns the practitioner's IHS number, looking it up on SATUSEHAT by NIK
 * and persisting it on first resolution.
 */
export async function ensurePractitionerIhs(
  supabase: SupabaseClient,
  fhir: FhirClient,
  practitionerId: string,
): Promise<string> {
  const { data: prac, error } = await supabase
    .from('practitioners')
    .select('id, nik, full_name, ss_ihs_number')
    .eq('id', practitionerId)
    .single()
  if (error || !prac) throw new Error(`practitioner ${practitionerId} not found: ${error?.message}`)
  if (prac.ss_ihs_number) return prac.ss_ihs_number
  if (!prac.nik) throw new Error(`practitioner ${prac.full_name} has no NIK — cannot resolve IHS`)

  const res = await fhir.get(`/Practitioner?identifier=${encodeURIComponent(`${FHIR.nik}|${prac.nik}`)}`)
  if (!res.ok) throw new Error(`Practitioner lookup failed ${res.status}: ${JSON.stringify(res.body)}`)
  const ihs = res.body?.entry?.[0]?.resource?.id
  if (!ihs) throw new Error(`SATUSEHAT has no Practitioner for NIK of ${prac.full_name}`)

  const { error: updateErr } = await supabase.from('practitioners')
    .update({ ss_practitioner_id: ihs, ss_ihs_number: ihs })
    .eq('id', practitionerId)
  if (updateErr) throw new Error(`Failed to persist IHS for practitioner ${practitionerId}: ${updateErr.message}`)
  return ihs
}
