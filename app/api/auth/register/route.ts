import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

const ORGANIZATION_ID = '28b360d2-93a2-4c97-a032-83af396be6ba'

const VALID_ROLES = ['doctor', 'nurse', 'pharmacist', 'cashier', 'lab_nurse', 'nutritionist', 'admin']

/**
 * POST /api/auth/register
 * Register a new practitioner — creates Supabase Auth user + practitioners record.
 * organization_id is hardcoded (single-org deployment).
 */
export async function POST(request: NextRequest) {
    const rl = await rateLimit(request, 'auth:register', RATE_LIMITS.auth)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const body = await request.json()
        const {
            full_name,
            nik,
            email,
            password,
            role,
            gender,
            phone,
            specialization,
            str_number,
            sip_number,
        } = body

        // ── Validation ─────────────────────────────────────────────────────
        if (!full_name?.trim())
            return apiResponse.badRequest('Nama lengkap wajib diisi')
        if (!nik?.trim() || !/^\d{16}$/.test(nik.trim()))
            return apiResponse.badRequest('NIK harus 16 digit angka')
        if (!email?.trim() || !/\S+@\S+\.\S+/.test(email))
            return apiResponse.badRequest('Format email tidak valid')
        if (!password || password.length < 8)
            return apiResponse.badRequest('Password minimal 8 karakter')
        if (!VALID_ROLES.includes(role))
            return apiResponse.badRequest('Role tidak valid')
        if (!['male', 'female'].includes(gender))
            return apiResponse.badRequest('Jenis kelamin tidak valid')
        if (role === 'doctor' && !specialization?.trim())
            return apiResponse.badRequest('Spesialisasi wajib diisi untuk dokter')

        const supabaseAdmin = createAdminClient()

        // ── Create Supabase Auth user ───────────────────────────────────────
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: email.trim().toLowerCase(),
            password,
            email_confirm: true,
        })

        if (authError || !authData.user) {
            const msg = authError?.message ?? ''
            if (msg.includes('already registered') || msg.includes('already been registered')) {
                return apiResponse.badRequest('Email sudah terdaftar')
            }
            return apiResponse.serverError('Gagal membuat akun: ' + msg)
        }

        // ── Insert practitioner record ──────────────────────────────────────
        const { data: practitioner, error: pracError } = await supabaseAdmin
            .from('practitioners')
            .insert({
                user_id: authData.user.id,
                organization_id: ORGANIZATION_ID,
                full_name: full_name.trim(),
                nik: nik.trim(),
                email: email.trim().toLowerCase(),
                role,
                gender,
                phone: phone?.trim() || null,
                specialization: specialization?.trim() || null,
                str_number: str_number?.trim() || null,
                sip_number: sip_number?.trim() || null,
                is_active: true,
            })
            .select('id, full_name, role')
            .single()

        if (pracError) {
            // Rollback auth user to avoid orphan
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id)

            if (pracError.code === '23505') {
                if (pracError.message.includes('nik'))
                    return apiResponse.badRequest('NIK sudah terdaftar')
                if (pracError.message.includes('email'))
                    return apiResponse.badRequest('Email sudah terdaftar')
            }
            return apiResponse.serverError('Gagal menyimpan data praktisi')
        }

        return apiResponse.created({
            id: practitioner.id,
            full_name: practitioner.full_name,
            role: practitioner.role,
        })
    } catch {
        return apiResponse.serverError()
    }
}
