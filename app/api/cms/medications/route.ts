/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireAdmin, isGuardError } from '@/lib/api/guards'
import * as Sentry from '@sentry/nextjs'

// GET /api/cms/medications?search=&active=true&page=1&limit=50
export async function GET(request: NextRequest) {
    const rl = await rateLimit(request, 'cms:medications:list', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAdmin(supabase)
        if (isGuardError(auth)) return auth

        const sp = new URL(request.url).searchParams
        const search = (sp.get('search') ?? '').slice(0, 200)
        const activeOnly = sp.get('active') !== 'false'
        const page = Math.max(1, parseInt(sp.get('page') ?? '1'))
        const limit = Math.min(100, parseInt(sp.get('limit') ?? '50'))
        const offset = (page - 1) * limit

        let query = supabase
            .from('medications')
            .select('id, name, generic_name, brand_name, form, strength, unit, category, kfa_code, ss_medication_id, is_narcotics, is_psychotropics, requires_prescription, is_active, created_at', { count: 'exact' })
            .eq('organization_id', auth.practitioner.organization_id)
            .order('name')
            .range(offset, offset + limit - 1)

        if (activeOnly) query = query.eq('is_active', true)
        if (search) query = query.or(`name.ilike.%${search}%,generic_name.ilike.%${search}%,brand_name.ilike.%${search}%,kfa_code.ilike.%${search}%`)

        const { data: meds, error, count } = await query
        if (error) { Sentry.captureException(error); return apiResponse.serverError(error.message) }

        // Aggregate stock per medication
        const medIds = (meds ?? []).map((m: any) => m.id)
        const { data: stocks } = await supabase
            .from('medication_stock')
            .select('medication_id, quantity, minimum_stock, unit_price, batch_number, expiry_date, is_below_minimum')
            .in('medication_id', medIds.length > 0 ? medIds : ['__none__'])
            .eq('organization_id', auth.practitioner.organization_id)
            .order('expiry_date', { ascending: true })

        const stockMap = new Map<string, any[]>()
        for (const s of stocks ?? []) {
            const arr = stockMap.get((s as any).medication_id) ?? []
            arr.push(s)
            stockMap.set((s as any).medication_id, arr)
        }

        const result = (meds ?? []).map((m: any) => {
            const batches = stockMap.get(m.id) ?? []
            const totalQty = batches.reduce((sum: number, b: any) => sum + (b.quantity ?? 0), 0)
            const belowMin = batches.some((b: any) => b.is_below_minimum)
            return { ...m, total_stock: totalQty, stock_below_minimum: belowMin, batches }
        })

        return apiResponse.ok(result, { total: count ?? 0, page, limit })
    } catch (e) {
        Sentry.captureException(e)
        return apiResponse.serverError()
    }
}

// POST /api/cms/medications
// Body: { name, generic_name?, brand_name?, form?, strength?, unit, category?, kfa_code?, ss_medication_id?, is_narcotics?, is_psychotropics?, requires_prescription?, stock? }
// stock: { batch_number?, expiry_date?, quantity, unit_price, minimum_stock? }
export async function POST(request: NextRequest) {
    const rl = await rateLimit(request, 'cms:medications:create', RATE_LIMITS.write)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const auth = await requireAdmin(supabase)
        if (isGuardError(auth)) return auth

        const body = await request.json()
        const { name, generic_name, brand_name, form, strength, unit, category, kfa_code, ss_medication_id, is_narcotics, is_psychotropics, requires_prescription, stock } = body

        if (!name?.trim()) return apiResponse.badRequest('Nama obat wajib diisi')
        if (!unit?.trim()) return apiResponse.badRequest('Satuan wajib diisi')

        // Use admin client so RLS doesn't block CMS mutations — authorization already enforced above
        const admin = createAdminClient()

        const { data: med, error: medErr } = await admin
            .from('medications')
            .insert({
                organization_id: auth.practitioner.organization_id,
                name: name.trim(),
                generic_name: generic_name?.trim() || null,
                brand_name: brand_name?.trim() || null,
                form: form?.trim() || null,
                strength: strength?.trim() || null,
                unit: unit.trim(),
                category: category?.trim() || null,
                kfa_code: kfa_code?.trim() || null,
                ss_medication_id: ss_medication_id?.trim() || null,
                is_narcotics: !!is_narcotics,
                is_psychotropics: !!is_psychotropics,
                requires_prescription: requires_prescription !== false,
                is_active: true,
            })
            .select()
            .single()

        if (medErr) {
            if (medErr.code === '23505') return apiResponse.conflict('Kode KFA sudah terdaftar')
            Sentry.captureException(medErr)
            return apiResponse.serverError(medErr.message)
        }

        // Optional initial stock batch
        if (stock && (stock.quantity ?? 0) > 0) {
            const { error: stockErr } = await admin
                .from('medication_stock')
                .insert({
                    medication_id: med.id,
                    organization_id: auth.practitioner.organization_id,
                    batch_number: stock.batch_number?.trim() || `INIT-${Date.now()}`,
                    expiry_date: stock.expiry_date || null,
                    quantity: Math.max(0, parseFloat(stock.quantity) || 0),
                    unit_price: parseFloat(stock.unit_price) || 0,
                    minimum_stock: parseInt(stock.minimum_stock) || 10,
                })

            if (stockErr) {
                Sentry.captureException(stockErr)
                // Don't fail — medication was created; stock can be added via PO later
            }
        }

        return apiResponse.created(med)
    } catch (e) {
        Sentry.captureException(e)
        return apiResponse.serverError()
    }
}
