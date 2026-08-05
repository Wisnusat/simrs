import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'
import { getAccessToken } from '@/lib/satusehat/auth'
import * as Sentry from '@sentry/nextjs'

const SS_BASE_URL = process.env.SATUSEHAT_BASE_URL ?? 'https://api-satusehat-stg.dto.kemkes.go.id'

// GET /api/cms/medications/kfa-search?q={keyword}&size=10
export async function GET(request: NextRequest) {
    const rl = await rateLimit(request, 'cms:kfa-search', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAdmin(supabase)
        if (isGuardError(auth)) return auth

        const sp = new URL(request.url).searchParams
        const q = sp.get('q')?.trim()
        const size = Math.min(20, parseInt(sp.get('size') ?? '10'))

        if (!q || q.length < 3) return apiResponse.badRequest('Keyword minimal 3 karakter')

        const token = await getAccessToken()
        const url = `${SS_BASE_URL}/kfa/v2/product/all?keyword=${encodeURIComponent(q)}&size=${size}&page=1`

        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
            },
        })

        if (!res.ok) {
            const text = await res.text()
            console.error('KFA search failed:', res.status, text)
            return apiResponse.serverError('Gagal mengambil data KFA dari SATUSEHAT')
        }

        const json = await res.json()

        // Normalize response — SATUSEHAT KFA returns data.data[] or data[]
        const raw: any[] = json?.data?.data ?? json?.data ?? []

        const items = raw.map((p: any) => ({
            kfa_code: p.kfa_code ?? p.code ?? '',
            name: p.name ?? p.product_name ?? '',
            generic_name: p.generic_name ?? p.generic ?? '',
            brand_name: p.brand_name ?? p.name ?? '',
            form: p.dosage_form ?? p.form ?? '',
            strength: p.strength ?? '',
            unit: p.unit ?? 'tablet',
            ss_medication_id: p.id ?? p.kfa_code ?? '',
        }))

        return apiResponse.ok(items)
    } catch (e) {
        Sentry.captureException(e)
        console.error('KFA search error:', e)
        return apiResponse.serverError('Gagal terhubung ke SATUSEHAT KFA')
    }
}
