import { SupabaseClient } from '@supabase/supabase-js'
import { apiResponse } from './response'

export interface AuthGuardResult {
    user: { id: string; email?: string }
}

export interface AdminGuardResult extends AuthGuardResult {
    practitioner: {
        id: string
        role: string
        organization_id: string
        full_name?: string
    }
}

/**
 * Verifies that the request has a valid Supabase session.
 * Returns the user or a 401 response.
 */
export async function requireAuth(
    supabase: SupabaseClient,
): Promise<AuthGuardResult | ReturnType<typeof apiResponse.unauthorized>> {
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser()

    if (error || !user) {
        return apiResponse.unauthorized()
    }

    return { user: { id: user.id, email: user.email } }
}

/**
 * Verifies the request has a valid session AND the user is an active admin practitioner.
 * Returns { user, practitioner } or a 403 response.
 */
export async function requireAdmin(
    supabase: SupabaseClient,
): Promise<AdminGuardResult | ReturnType<typeof apiResponse.forbidden>> {
    const authResult = await requireAuth(supabase)

    // If requireAuth returned a NextResponse (error), propagate it
    if (isGuardError(authResult)) {
        return authResult
    }

    const { user } = authResult

    if (user.id === 'service-account') {
        return { user, practitioner: { id: 'service-account', role: 'admin', organization_id: 'system' } }
    }

    const { data: practitioner, error } = await supabase
        .from('practitioners')
        .select('id, role, organization_id, full_name')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

    // Owner is a superset of admin — accept both
    if (error || !practitioner || !['admin', 'owner'].includes(practitioner.role)) {
        return apiResponse.forbidden('Forbidden — admin only')
    }

    return { user, practitioner }
}

/**
 * Verifies the request has a valid session AND the user is an owner.
 * Use for owner-only endpoints (reports, PO approval).
 */
export async function requireOwner(
    supabase: SupabaseClient,
): Promise<AdminGuardResult | ReturnType<typeof apiResponse.forbidden>> {
    const authResult = await requireAuth(supabase)

    if (isGuardError(authResult)) {
        return authResult
    }

    const { user } = authResult

    const { data: practitioner, error } = await supabase
        .from('practitioners')
        .select('id, role, organization_id, full_name')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

    if (error || !practitioner || practitioner.role !== 'owner') {
        return apiResponse.forbidden('Forbidden — owner only')
    }

    return { user, practitioner }
}

/**
 * Verifies the request has a valid session AND the user is any active practitioner.
 * Returns { user, practitioner } or an error response.
 * Use this for all outpatient clinical routes (nurse, doctor, pharmacist, etc.)
 */
export async function requirePractitioner(
    supabase: SupabaseClient,
): Promise<AdminGuardResult | ReturnType<typeof apiResponse.unauthorized> | ReturnType<typeof apiResponse.forbidden>> {
    const authResult = await requireAuth(supabase)

    if (isGuardError(authResult)) {
        return authResult
    }

    const { user } = authResult

    const { data: practitioner, error } = await supabase
        .from('practitioners')
        .select('id, role, organization_id, full_name')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

    if (error || !practitioner) {
        return apiResponse.forbidden('Forbidden — active practitioner required')
    }

    return { user, practitioner }
}

/**
 * Type guard to check if the result of requireAuth / requireAdmin is an error response.
 * Usage:
 *   const auth = await requireAuth(supabase)
 *   if (isGuardError(auth)) return auth
 *   const { user } = auth
 */
export function isGuardError<T>(
    result: T | ReturnType<typeof apiResponse.unauthorized> | ReturnType<typeof apiResponse.forbidden>
): result is ReturnType<typeof apiResponse.unauthorized> | ReturnType<typeof apiResponse.forbidden> {
    return result instanceof Response
}
