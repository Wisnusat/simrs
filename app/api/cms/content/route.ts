import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'

/**
 * GET /api/cms/content
 * Returns all CMS content sections for the organization.
 * Auth: Admin / Owner
 */
export async function GET(request: NextRequest) {
    const rl = rateLimit(request, 'cms:content:list', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const admin = await requireAdmin(supabase)
        if (isGuardError(admin)) return admin

        const { data: content, error } = await supabase
            .from('cms_content')
            .select('*')
            .eq('organization_id', admin.practitioner.organization_id)
            .order('section_key', { ascending: true })

        if (error) {
            console.error('CMS content fetch error:', error)
            return apiResponse.serverError('Failed to fetch CMS content')
        }

        return apiResponse.ok(content ?? [])
    } catch {
        return apiResponse.serverError()
    }
}

/**
 * PUT /api/cms/content
 * Upsert CMS content for a specific section.
 * Body: { section_key: string, content: object }
 * Auth: Admin / Owner
 */
export async function PUT(request: NextRequest) {
    const rl = rateLimit(request, 'cms:content:upsert', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const admin = await requireAdmin(supabase)
        if (isGuardError(admin)) return admin

        const body = await request.json()
        const { section_key, content } = body

        if (!section_key || !content) {
            return apiResponse.badRequest('section_key and content are required')
        }

        const validKeys = ['hero', 'about', 'services', 'faq', 'contact', 'stats', 'gallery']
        if (!validKeys.includes(section_key)) {
            return apiResponse.badRequest(`Invalid section_key. Must be one of: ${validKeys.join(', ')}`)
        }

        if (typeof content !== 'object' || Array.isArray(content)) {
            return apiResponse.badRequest('content must be a JSON object')
        }

        const { data: upserted, error } = await supabase
            .from('cms_content')
            .upsert({
                organization_id: admin.practitioner.organization_id,
                section_key,
                content,
                updated_by: admin.practitioner.id,
                is_active: true,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'organization_id,section_key',
            })
            .select()
            .single()

        if (error) {
            console.error('CMS content upsert error:', error)
            return apiResponse.serverError('Failed to save CMS content')
        }

        return apiResponse.ok(upserted)
    } catch {
        return apiResponse.serverError()
    }
}
