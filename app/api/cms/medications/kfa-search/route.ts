/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'
import { getAccessToken } from '@/lib/satusehat/auth'
import * as Sentry from '@sentry/nextjs'

const SS_BASE_URL = process.env.SATUSEHAT_BASE_URL ?? 'https://api-satusehat-stg.dto.kemkes.go.id'

// GET /api/cms/medications/kfa-search?q={keyword}&size=20&page=1
export async function GET(request: NextRequest) {
    const rl = await rateLimit(request, 'cms:kfa-search', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAdmin(supabase)
        if (isGuardError(auth)) return auth

        const sp = new URL(request.url).searchParams
        const q = sp.get('q')?.trim() ?? ''
        const size = Math.min(50, parseInt(sp.get('size') ?? '20'))
        const page = Math.max(1, parseInt(sp.get('page') ?? '1'))

        const token = await getAccessToken()
        const params = new URLSearchParams({ page: String(page), size: String(size), product_type: 'farmasi' })
        if (q.length >= 3) params.set('keyword', q)
        const url = `${SS_BASE_URL}/kfa-v2/products/all?${params}`

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

        // KFA v2 response: { total, page, size, items: { data: [...] } }
        const raw: any[] = json?.items?.data ?? json?.data?.data ?? json?.data ?? []

        const items = raw.map((p: any) => ({
            kfa_code: p.kfa_code ?? '',
            name: p.name ?? '',
            generic_name: p.active_ingredients?.[0]?.zat_aktif ?? '',
            brand_name: p.nama_dagang ?? '',
            form: p.dosage_form?.name ?? '',
            strength: p.active_ingredients?.[0]?.kekuatan_zat_aktif ?? '',
            unit: p.uom?.name ?? 'Tablet',
            ss_medication_id: p.kfa_code ?? '',
            manufacturer: p.manufacturer ?? '',
            active: p.active ?? true,
        }))

        const response = apiResponse.ok(items, {
            total: json.total ?? items.length,
            page: json.page ?? page,
            size: json.size ?? size,
        })
        response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60')
        return response
    } catch (e) {
        Sentry.captureException(e)
        console.error('KFA search error:', e)
        return apiResponse.serverError('Gagal terhubung ke SATUSEHAT KFA')
    }
}
