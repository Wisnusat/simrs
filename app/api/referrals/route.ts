import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import * as Sentry from '@sentry/nextjs'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const auth = await requirePractitioner(supabase)
    if (isGuardError(auth)) return auth

    const body = await req.json()
    const { 
      encounter_id, 
      patient_id, 
      destination_facility_name, 
      destination_specialty, 
      referral_reason, 
      urgency 
    } = body

    if (!encounter_id || !patient_id || !destination_facility_name || !referral_reason) {
      return apiResponse.badRequest('Missing required fields for referral')
    }

    const { data, error } = await supabase
      .from('referrals')
      .insert({
        encounter_id,
        patient_id,
        referred_by: auth.practitioner.id,
        destination_facility_name,
        destination_specialty: destination_specialty || null,
        referral_reason,
        urgency: urgency || 'routine',
        ss_sync_status: 'not_required'
      })
      .select()
      .single()

    if (error) {
      console.error('Insert referral error:', error)
      Sentry.captureException(error)
      return apiResponse.serverError(error.message)
    }

    return apiResponse.created(data)

  } catch (err: any) {
    console.error('Referrals POST error:', err)
    Sentry.captureException(err)
    return apiResponse.serverError(err.message)
  }
}
