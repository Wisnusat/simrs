import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'
import { realFhirClient } from '@/lib/satusehat/client'
import { lookupPatientByNik, ensurePatientIhs } from '@/lib/satusehat/patient-service'
import * as Sentry from '@sentry/nextjs'

/**
 * POST /api/patients/verify
 * Synchronous NIK verification for registration / check-in.
 *
 * Body: { nik: string }
 * Response: { success: true, data: { status: 'found_local' | 'found_ihs' | 'not_found', patient?: <patients row> } }
 *
 * Flow:
 *  1. Local DB lookup by NIK (admin client to bypass RLS)
 *     → if found: refresh IHS number in background, return found_local
 *  2. SATUSEHAT FHIR lookup by NIK
 *     → if found: auto-create local patient from FHIR demographics, return found_ihs
 *  3. Neither side knows the NIK → return not_found (frontend opens full registration form)
 */
export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, 'patients-verify:post', RATE_LIMITS.write)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const body = await req.json()
  const { nik } = body ?? {}
  if (!nik || !/^\d{16}$/.test(nik)) return apiResponse.badRequest('NIK harus 16 digit')

  const admin = createAdminClient()

  // --- 1. Local patient lookup ---
  const { data: local } = await admin
    .from('patients')
    .select('*')
    .eq('nik', nik)
    .maybeSingle()

  if (local) {
    if (!local.ss_ihs_number) {
      // Refresh IHS number in background of this request; non-fatal on failure
      try {
        await ensurePatientIhs(admin, realFhirClient, local.id)
      } catch (e) {
        console.error('IHS refresh failed:', e)
        Sentry.captureException(e)
      }
    }
    const { data: fresh } = await admin.from('patients').select('*').eq('id', local.id).single()
    return apiResponse.ok({ status: 'found_local', patient: fresh })
  }

  // --- 2. SATUSEHAT lookup by NIK ---
  let found: Awaited<ReturnType<typeof lookupPatientByNik>> = null
  try {
    found = await lookupPatientByNik(realFhirClient, nik)
  } catch (e) {
    console.error('SATUSEHAT lookup error:', e)
    Sentry.captureException(e)
    // Degrade gracefully — staff can register manually
    return apiResponse.ok({ status: 'not_found' })
  }

  if (!found) return apiResponse.ok({ status: 'not_found' })

  // --- 3. Auto-create local patient from FHIR demographics ---
  // Generate medical_record_no using the same DB function as manual registration
  const { data: mrData, error: mrError } = await admin
    .rpc('generate_medical_record_no', { p_org_id: auth.practitioner.organization_id })

  if (mrError || !mrData) {
    console.error('MR number generation failed:', mrError)
    Sentry.captureException(mrError)
    return apiResponse.serverError('Gagal membuat nomor rekam medis')
  }
  const medical_record_no = mrData as string

  const r = found.resource

  // Guard: birthDate is NOT NULL in DB — skip insert if SATUSEHAT returned no date
  if (!r.birthDate) {
    console.error('SATUSEHAT patient missing birthDate for NIK verification')
    Sentry.captureMessage('SATUSEHAT patient missing birthDate for NIK verification', 'error')
    return apiResponse.ok({ status: 'not_found' })
  }

  const genderAllowed = ['male', 'female', 'other', 'unknown'] as const
  type AllowedGender = (typeof genderAllowed)[number]
  const gender: AllowedGender = (genderAllowed as readonly string[]).includes(r.gender)
    ? (r.gender as AllowedGender)
    : 'male'

  const { data: created, error: insertError } = await admin
    .from('patients')
    .insert({
      nik,
      full_name: r.name?.[0]?.text ?? r.name?.[0]?.given?.join(' ') ?? 'Tanpa Nama',
      gender,
      date_of_birth: r.birthDate,
      address: r.address?.[0]?.line?.join(', ') ?? null,
      city: r.address?.[0]?.city ?? null,
      phone: r.telecom?.find((t: { system: string; value?: string }) => t.system === 'phone')?.value ?? null,
      medical_record_no,
      ss_patient_id: found.ihs,
      ss_ihs_number: found.ihs,
      is_active: true,
    })
    .select()
    .single()

  if (insertError) {
    // Race condition: another request already inserted this patient
    if (insertError.code === '23505') {
      const { data: refetched } = await admin
        .from('patients')
        .select('*')
        .eq('nik', nik)
        .single()
      return apiResponse.ok({ status: 'found_local', patient: refetched })
    }
    console.error('Patient auto-create error:', insertError)
    Sentry.captureException(insertError)
    return apiResponse.serverError('Gagal membuat pasien')
  }

  return apiResponse.ok({ status: 'found_ihs', patient: created })
}
