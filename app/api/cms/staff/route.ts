import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'

/**
 * GET /api/cms/staff
 * Lists all practitioners in the organization.
 * Auth: Admin / Owner
 */
export async function GET(request: NextRequest) {
    const rl = rateLimit(request, 'cms:staff:list', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const admin = await requireAdmin(supabase)
        if (isGuardError(admin)) return admin

        const { searchParams } = new URL(request.url)
        const role = searchParams.get('role')
        const activeOnly = searchParams.get('active') !== 'false'

        let query = supabase
            .from('practitioners')
            .select('*')
            .eq('organization_id', admin.practitioner.organization_id)
            .order('full_name', { ascending: true })

        if (role) query = query.eq('role', role)
        if (activeOnly) query = query.eq('is_active', true)

        const { data: staff, error } = await query

        if (error) {
            console.error('Staff list error:', error)
            return apiResponse.serverError('Failed to fetch staff')
        }

        return apiResponse.ok(staff)
    } catch {
        return apiResponse.serverError()
    }
}

/**
 * POST /api/cms/staff
 * Creates a new practitioner. Optionally creates a Supabase auth account.
 * Auth: Admin / Owner
 */
export async function POST(request: NextRequest) {
    const rl = rateLimit(request, 'cms:staff:create', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const admin = await requireAdmin(supabase)
        if (isGuardError(admin)) return admin

        const body = await request.json()
        const { full_name, email, role, specialization, gender, phone, nik, nip, str_number, sip_number } = body

        if (!full_name || !role) {
            return apiResponse.badRequest('full_name and role are required')
        }

        const validRoles = ['admin', 'owner', 'doctor', 'nurse', 'lab_nurse', 'pharmacist', 'nutritionist', 'cashier']
        if (!validRoles.includes(role)) {
            return apiResponse.badRequest(`Invalid role. Must be one of: ${validRoles.join(', ')}`)
        }

        const practitionerData: Record<string, unknown> = {
            organization_id: admin.practitioner.organization_id,
            full_name,
            role,
            specialization: specialization ?? null,
            gender: gender ?? null,
            phone: phone ?? null,
            email: email ?? null,
            nik: nik ?? null,
            nip: nip ?? null,
            str_number: str_number ?? null,
            sip_number: sip_number ?? null,
            is_active: true,
        }

        const { data: newStaff, error: insertError } = await supabase
            .from('practitioners')
            .insert(practitionerData)
            .select()
            .single()

        if (insertError) {
            console.error('Staff insert error:', insertError)
            if (insertError.code === '23505') {
                return apiResponse.conflict('Staff member with this NIK/NIP already exists')
            }
            return apiResponse.serverError('Failed to create staff member')
        }

        return apiResponse.created(newStaff)
    } catch {
        return apiResponse.serverError()
    }
}
