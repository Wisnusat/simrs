/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireOwner, isGuardError } from '@/lib/api/guards'
import { generateExcelResponse } from '@/lib/api/excel-export'

/**
 * GET /api/cms/reports/medications
 * Medication stock & usage report.
 * Auth: Owner only
 */
export async function GET(request: NextRequest) {
    const rl = rateLimit(request, 'cms:report:meds', RATE_LIMITS.read)
    if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter)

    try {
        const supabase = await createClient()
        const owner = await requireOwner(supabase)
        if (isGuardError(owner)) return owner

        const { searchParams } = new URL(request.url)
        const now = new Date()
        const from = searchParams.get('from') ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
        const to = searchParams.get('to') ?? now.toISOString().split('T')[0]
        const format = searchParams.get('format')

        // Get all medications with stock info
        const { data: medications, error: medError } = await supabase
            .from('medications')
            .select('id, name, generic_name, form, strength, unit, category')
            .eq('organization_id', owner.practitioner.organization_id)
            .eq('is_active', true)
            .order('name')

        if (medError) {
            return apiResponse.serverError('Failed to fetch medications')
        }

        const medIds = (medications ?? []).map((m: any) => m.id)

        // Get stock data
        const { data: stocks } = await supabase
            .from('medication_stock')
            .select('medication_id, quantity, minimum_stock, expiry_date, is_below_minimum')
            .eq('organization_id', owner.practitioner.organization_id)
            .in('medication_id', medIds.length > 0 ? medIds : ['__none__'])

        // Get dispenses in period
        const { data: dispenses } = await supabase
            .from('medication_dispenses')
            .select('medication_id, quantity_dispensed')
            .in('medication_id', medIds.length > 0 ? medIds : ['__none__'])
            .gte('dispensed_at', `${from}T00:00:00`)
            .lte('dispensed_at', `${to}T23:59:59`)

        // Aggregate stock per medication
        const stockMap = new Map<string, { total: number; min: number; belowMin: boolean; expiring: number }>()
        const threeMonthsFromNow = new Date()
        threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)

        for (const s of stocks ?? []) {
            const existing = stockMap.get(s.medication_id) ?? { total: 0, min: 0, belowMin: false, expiring: 0 }
            existing.total += Number(s.quantity) || 0
            existing.min = Math.max(existing.min, Number(s.minimum_stock) || 0)
            if (s.is_below_minimum) existing.belowMin = true
            if (s.expiry_date && new Date(s.expiry_date) <= threeMonthsFromNow) existing.expiring++
            stockMap.set(s.medication_id, existing)
        }

        // Aggregate dispenses per medication
        const dispenseMap = new Map<string, number>()
        for (const d of dispenses ?? []) {
            dispenseMap.set(d.medication_id, (dispenseMap.get(d.medication_id) ?? 0) + (Number(d.quantity_dispensed) || 0))
        }

        const rows = (medications ?? []).map((med: any) => {
            const stock = stockMap.get(med.id)
            return {
                medication_id: med.id,
                name: med.name,
                generic_name: med.generic_name,
                form: med.form,
                strength: med.strength,
                unit: med.unit,
                category: med.category,
                current_stock: stock?.total ?? 0,
                minimum_stock: stock?.min ?? 0,
                is_below_minimum: stock?.belowMin ?? false,
                dispensed_qty: dispenseMap.get(med.id) ?? 0,
                expiring_batches: stock?.expiring ?? 0,
            }
        })

        const summary = {
            total_medications: rows.length,
            below_minimum: rows.filter(r => r.is_below_minimum).length,
            expiring_soon: rows.filter(r => r.expiring_batches > 0).length,
            total_dispensed: rows.reduce((s, r) => s + r.dispensed_qty, 0),
        }

        if (format === 'xlsx') {
            return generateExcelResponse([{
                name: 'Medication Report',
                data: rows as any,
                columns: [
                    { header: 'Nama Obat', key: 'name', width: 28 },
                    { header: 'Nama Generik', key: 'generic_name', width: 22 },
                    { header: 'Bentuk', key: 'form', width: 12 },
                    { header: 'Kekuatan', key: 'strength', width: 12 },
                    { header: 'Satuan', key: 'unit', width: 10 },
                    { header: 'Kategori', key: 'category', width: 16 },
                    { header: 'Stok Saat Ini', key: 'current_stock', width: 14 },
                    { header: 'Stok Minimum', key: 'minimum_stock', width: 14 },
                    { header: 'Di Bawah Min?', key: 'is_below_minimum', width: 14 },
                    { header: 'Terdispensasi', key: 'dispensed_qty', width: 14 },
                    { header: 'Batch Kedaluwarsa', key: 'expiring_batches', width: 18 },
                ],
            }], `laporan-obat-${from}-${to}`)
        }

        return apiResponse.ok({ rows, summary, period: { from, to } })
    } catch {
        return apiResponse.serverError()
    }
}
