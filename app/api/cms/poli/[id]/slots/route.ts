import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'
import * as Sentry from '@sentry/nextjs'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, context: RouteContext) {
    const rl = await rateLimit(request, 'cms:poli:slots:list', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const { id } = await context.params
        const supabase = await createClient()
        const auth = await requireAdmin(supabase)
        if (isGuardError(auth)) return auth

        const { data, error } = await supabase
            .from('appointment_slots')
            .select(`
                id, start_time, end_time, quota, booked_count, is_active, is_available,
                practitioner_id,
                practitioners (id, full_name, specialization)
            `)
            .eq('poli_service_id', id)
            .order('start_time', { ascending: true })

        if (error) {
            Sentry.captureException(error)
            return apiResponse.serverError(error.message)
        }

        return apiResponse.ok(data ?? [])
    } catch (e: any) {
        Sentry.captureException(e)
        return apiResponse.serverError()
    }
}

export async function POST(request: NextRequest, context: RouteContext) {
    const rl = await rateLimit(request, 'cms:poli:slots:create', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const { id } = await context.params
        const supabase = await createClient()
        const auth = await requireAdmin(supabase)
        if (isGuardError(auth)) return auth

        const body = await request.json()
        const { start_time, end_time, quota, practitioner_id } = body

        if (!start_time || !end_time) {
            return apiResponse.badRequest('Jam mulai dan jam selesai wajib diisi')
        }
        if (start_time >= end_time) {
            return apiResponse.badRequest('Jam mulai harus sebelum jam selesai')
        }

        const { data, error } = await supabase
            .from('appointment_slots')
            .insert({
                poli_service_id: id,
                start_time,
                end_time,
                quota: quota ?? 20,
                practitioner_id: practitioner_id || null,
                is_active: true,
                is_available: true,
            })
            .select()
            .single()

        if (error) {
            Sentry.captureException(error)
            return apiResponse.serverError(error.message)
        }

        return apiResponse.created(data)
    } catch (e: any) {
        Sentry.captureException(e)
        return apiResponse.serverError()
    }
}
