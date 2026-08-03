/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireOwner, isGuardError } from '@/lib/api/guards'
import { generateExcelResponse } from '@/lib/api/excel-export'
import * as Sentry from '@sentry/nextjs'

/**
 * GET /api/cms/reports/lab
 * Lab orders report.
 * Auth: Owner only
 */
export async function GET(request: NextRequest) {
    const rl = await rateLimit(request, 'cms:report:lab', RATE_LIMITS.read)
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

        // Get lab orders in period
        const { data: labOrders, error } = await supabase
            .from('lab_orders')
            .select(`
                id, status, order_date,
                lab_order_items (test_name, loinc_code, result_value)
            `)
            .gte('order_date', `${from}T00:00:00`)
            .lte('order_date', `${to}T23:59:59`)
            .order('order_date', { ascending: true })

        if (error) {
            console.error('Lab report error:', error)
            Sentry.captureException(error)
            return apiResponse.serverError('Failed to fetch lab data')
        }

        // Aggregate by test
        const testMap = new Map<string, any>()

        for (const order of labOrders ?? []) {
            for (const item of (order.lab_order_items ?? []) as any[]) {
                const key = item.loinc_code || item.test_name
                const existing = testMap.get(key) ?? {
                    test_name: item.test_name,
                    loinc_code: item.loinc_code,
                    total_orders: 0,
                    completed: 0,
                    pending: 0,
                }
                existing.total_orders++
                if (item.result_value) {
                    existing.completed++
                } else {
                    existing.pending++
                }
                testMap.set(key, existing)
            }
        }

        const rows = Array.from(testMap.values()).sort((a, b) => b.total_orders - a.total_orders)

        const summary = {
            total_orders: (labOrders ?? []).length,
            total_tests: rows.reduce((s, r) => s + r.total_orders, 0),
            completed_tests: rows.reduce((s, r) => s + r.completed, 0),
            pending_tests: rows.reduce((s, r) => s + r.pending, 0),
        }

        if (format === 'xlsx') {
            return generateExcelResponse([{
                name: 'Lab Report',
                data: rows,
                columns: [
                    { header: 'Nama Tes', key: 'test_name', width: 30 },
                    { header: 'Kode LOINC', key: 'loinc_code', width: 14 },
                    { header: 'Total Order', key: 'total_orders', width: 14 },
                    { header: 'Selesai', key: 'completed', width: 12 },
                    { header: 'Pending', key: 'pending', width: 12 },
                ],
            }], `laporan-lab-${from}-${to}`)
        }

        return apiResponse.ok({ rows, summary, period: { from, to } })
    } catch {
        return apiResponse.serverError()
    }
}
