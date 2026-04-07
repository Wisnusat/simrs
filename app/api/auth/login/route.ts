import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'

/**
 * POST /api/auth/login
 * Authenticate a staff member with email + password.
 */
export async function POST(request: NextRequest) {
    // Rate limit: strict — brute-force protection
    const rl = rateLimit(request, 'auth:login', RATE_LIMITS.auth)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const body = await request.json()
        const { email, password } = body

        if (!email || !password) {
            return apiResponse.badRequest('Email and password are required')
        }

        const supabase = await createClient()

        // Sign in with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (authError || !authData.user) {
            return apiResponse.error('Invalid email or password', 401)
        }

        // Fetch practitioner profile + organization
        const { data: practitioner, error: profileError } = await supabase
            .from('practitioners')
            .select(`
                id,
                full_name,
                role,
                specialization,
                email,
                organization_id,
                organizations (
                    id,
                    name,
                    type
                )
            `)
            .eq('user_id', authData.user.id)
            .eq('is_active', true)
            .single()

        if (profileError || !practitioner) {
            // Auth succeeded but no practitioner profile — sign out and reject
            await supabase.auth.signOut()
            return apiResponse.error('Staff profile not found. Contact administrator.', 403)
        }

        return apiResponse.ok({
            user: {
                id: authData.user.id,
                email: authData.user.email,
            },
            profile: {
                id: practitioner.id,
                full_name: practitioner.full_name,
                role: practitioner.role,
                specialization: practitioner.specialization,
                organization_id: practitioner.organization_id,
                organization: practitioner.organizations,
            },
        })
    } catch {
        return apiResponse.serverError()
    }
}