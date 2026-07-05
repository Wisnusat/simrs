import { SupabaseClient } from '@supabase/supabase-js'
import type { FhirClient } from './client'
import { FHIR } from './config'

export interface LocalPatient {
  id: string
  nik: string | null
  full_name: string
  gender: 'male' | 'female'
  date_of_birth: string
  address: string | null
  city: string | null
  postal_code: string | null
  phone: string | null
}

export function buildPatientPayload(p: LocalPatient): object {
  return {
    resourceType: 'Patient',
    meta: { profile: ['https://fhir.kemkes.go.id/r4/StructureDefinition/Patient'] },
    identifier: [{ use: 'official', system: FHIR.nik, value: p.nik }],
    active: true,
    name: [{ use: 'official', text: p.full_name }],
    gender: p.gender,
    birthDate: p.date_of_birth,
    ...(p.address ? {
      address: [{
        use: 'home', line: [p.address],
        ...(p.city ? { city: p.city } : {}),
        ...(p.postal_code ? { postalCode: p.postal_code } : {}),
        country: 'ID',
      }],
    } : {}),
    ...(p.phone ? { telecom: [{ system: 'phone', value: p.phone, use: 'mobile' }] } : {}),
  }
}

export async function lookupPatientByNik(fhir: FhirClient, nik: string) {
  const res = await fhir.get(`/Patient?identifier=${encodeURIComponent(`${FHIR.nik}|${nik}`)}`)
  if (!res.ok) throw new Error(`Patient lookup failed ${res.status}: ${JSON.stringify(res.body)}`)
  const resource = res.body?.entry?.[0]?.resource
  if (!resource?.id) return null
  return { ihs: resource.id as string, resource }
}

export async function ensurePatientIhs(
  supabase: SupabaseClient,
  fhir: FhirClient,
  patientId: string,
): Promise<string> {
  const { data: pat, error } = await supabase
    .from('patients')
    .select('id, nik, full_name, gender, date_of_birth, address, city, postal_code, phone, ss_ihs_number')
    .eq('id', patientId)
    .single()
  if (error || !pat) throw new Error(`patient ${patientId} not found: ${error?.message}`)
  if (pat.ss_ihs_number) return pat.ss_ihs_number
  if (!pat.nik) throw new Error(`patient ${pat.full_name} has no NIK — cannot resolve IHS`)

  const found = await lookupPatientByNik(fhir, pat.nik)
  let ihs: string
  if (found) {
    ihs = found.ihs
  } else {
    const res = await fhir.post('/Patient', buildPatientPayload(pat as LocalPatient))
    if (!res.ok) throw new Error(`Patient create failed ${res.status}: ${JSON.stringify(res.body)}`)
    // POST /Patient returns a non-FHIR envelope: { data: { patient_id: "P0…" } }
    ihs = res.body?.data?.patient_id ?? res.body?.id
    if (!ihs) throw new Error(`Patient create returned no id: ${JSON.stringify(res.body)}`)
  }
  const { error: updateErr } = await supabase.from('patients')
    .update({ ss_patient_id: ihs, ss_ihs_number: ihs })
    .eq('id', patientId)
  if (updateErr) throw new Error(`Failed to persist IHS for patient ${patientId}: ${updateErr.message}`)
  return ihs
}
