import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import * as Sentry from '@sentry/nextjs'

export async function POST(request: NextRequest) {
    const rl = await rateLimit(request, 'auth:change-password', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requirePractitioner(supabase)
        if (isGuardError(auth)) return auth

        const body = await request.json()
        const { currentPassword, newPassword } = body ?? {}

        if (!currentPassword || !newPassword) {
            return apiResponse.badRequest('currentPassword dan newPassword wajib diisi')
        }
        if (typeof newPassword !== 'string' || newPassword.length < 8) {
            return apiResponse.badRequest('Password baru minimal 8 karakter')
        }
        if (currentPassword === newPassword) {
            return apiResponse.badRequest('Password baru harus berbeda dari password lama')
        }

        // Verify current password by re-authenticating
        const { error: signInErr } = await supabase.auth.signInWithPassword({
            email: auth.user.email!,
            password: currentPassword,
        })
        if (signInErr) {
            return apiResponse.badRequest('Password saat ini tidak sesuai')
        }

        // Update to new password
        const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
        if (updateErr) {
            Sentry.captureException(updateErr)
            return apiResponse.serverError('Gagal mengubah password')
        }

        return apiResponse.ok({ message: 'Password berhasil diubah' })
    } catch (e) {
        Sentry.captureException(e)
        return apiResponse.serverError()
    }
}
