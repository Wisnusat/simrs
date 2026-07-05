import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requireAuth, isGuardError } from '@/lib/api/guards'
import { getVClaimClient } from '@/lib/bpjs/vclaim'

function generateBookingCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = 'WI' // Prefix WI for Walk-In
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
}

// Ensure time is formatted HH:mm:ss
function formatTime(date: Date) {
    const hh = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}:00`
}

// Ensure date is formatted YYYY-MM-DD
function formatDate(date: Date) {
    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const auth = await requireAuth(supabase)
        if (isGuardError(auth)) return auth

        const body = await req.json()
        const { patientId, poliServiceId, paymentMethod } = body

        if (!patientId || !poliServiceId || !paymentMethod) {
            return apiResponse.badRequest('Missing required fields: patientId, poliServiceId, paymentMethod')
        }

        const now = new Date()
        const dateStr = formatDate(now)
        const timeStr = formatTime(now)
        const bookingCode = generateBookingCode()

        // BPJS eligibility check (synchronous, required before check-in)
        if (paymentMethod === 'bpjs') {
            const { data: patient } = await supabase
                .from('patients').select('bpjs_no').eq('id', patientId).single()
            if (!patient?.bpjs_no) {
                return apiResponse.badRequest('Pasien belum memiliki nomor BPJS terdaftar')
            }
            const elig = await getVClaimClient().checkEligibility(patient.bpjs_no, dateStr)
            if (!elig.eligible) {
                return apiResponse.badRequest(`Verifikasi BPJS gagal: ${elig.reason ?? 'peserta tidak aktif'}`)
            }
        }

        // 1. Create Appointment
        const { data: appointmentData, error: appointmentError } = await supabase.rpc('create_appointment', {
            p_patient_id: patientId,
            p_poli_service_id: poliServiceId,
            p_booking_code: bookingCode,
            p_appointment_date: dateStr,
            p_appointment_time: timeStr,
            p_payment_type: paymentMethod === 'bpjs' ? 'bpjs' : 'umum',
            p_device_id: 'walkin-nurse-dashboard', // static device id for walk-in
        })

        if (appointmentError) {
            console.error('Walk-in create_appointment RPC error:', appointmentError)
            
            if (appointmentError.message?.includes('POLI_NOT_FOUND')) {
                return apiResponse.notFound('Poli service not found or inactive')
            }
            if (appointmentError.message?.includes('PATIENT_NOT_FOUND')) {
                return apiResponse.notFound('Patient not found')
            }
            if (appointmentError.code === '23505') {
                return apiResponse.conflict('Booking code collision, please try again')
            }
            
            return apiResponse.serverError('Failed to create walk-in appointment')
        }

        // 2. Automatically Check-in
        const appointmentId = appointmentData.id
        
        const { data: checkinData, error: checkinError } = await supabase.rpc('checkin_appointment', {
            p_appointment_id: appointmentId
        })

        if (checkinError) {
            console.error('Walk-in checkin_appointment RPC error:', checkinError)
            return apiResponse.serverError('Appointment created but check-in failed')
        }

        return apiResponse.created({
            booking_code: bookingCode,
            appointment: appointmentData,
            queue: checkinData
        })

    } catch (e) {
        console.error('Walk-in POST error:', e)
        return apiResponse.serverError()
    }
}
