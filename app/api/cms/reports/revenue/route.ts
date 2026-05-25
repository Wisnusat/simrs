/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireOwner, isGuardError } from '@/lib/api/guards'
import { generateExcelResponse } from '@/lib/api/excel-export'

/**
 * GET /api/cms/reports/revenue
 * Revenue report with date range filtering and optional Excel download.
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&format=xlsx
 * Auth: Owner only
 */
export async function GET(request: NextRequest) {
    const rl = rateLimit(request, 'cms:report:revenue', RATE_LIMITS.read)
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

        const { data: invoices, error } = await supabase
            .from('invoices')
            .select('id, invoice_date, payment_type, subtotal, discount_amount, tax_amount, total_amount, paid_amount, status')
            .eq('organization_id', owner.practitioner.organization_id)
            .gte('invoice_date', `${from}T00:00:00`)
            .lte('invoice_date', `${to}T23:59:59`)
            .order('invoice_date', { ascending: true })

        if (error) {
            console.error('Revenue report error:', error)
            return apiResponse.serverError('Failed to fetch revenue data')
        }

        // Aggregate by date
        const dailyMap = new Map<string, any>()
        for (const inv of invoices ?? []) {
            const date = new Date(inv.invoice_date).toISOString().split('T')[0]
            const existing = dailyMap.get(date) ?? {
                date,
                total_invoices: 0,
                subtotal: 0,
                discount: 0,
                tax: 0,
                total: 0,
                paid: 0,
                unpaid: 0,
                payment_umum: 0,
                payment_bpjs: 0,
            }
            existing.total_invoices++
            existing.subtotal += Number(inv.subtotal) || 0
            existing.discount += Number(inv.discount_amount) || 0
            existing.tax += Number(inv.tax_amount) || 0
            existing.total += Number(inv.total_amount) || 0
            if (inv.status === 'paid') {
                existing.paid += Number(inv.paid_amount || inv.total_amount) || 0
            } else if (inv.status === 'unpaid') {
                existing.unpaid += Number(inv.total_amount) || 0
            }
            if (inv.payment_type === 'umum') existing.payment_umum += Number(inv.total_amount) || 0
            if (inv.payment_type === 'bpjs') existing.payment_bpjs += Number(inv.total_amount) || 0
            dailyMap.set(date, existing)
        }

        const rows = Array.from(dailyMap.values())

        // Summary totals
        const summary = {
            total_invoices: rows.reduce((s, r) => s + r.total_invoices, 0),
            total_revenue: rows.reduce((s, r) => s + r.total, 0),
            total_paid: rows.reduce((s, r) => s + r.paid, 0),
            total_unpaid: rows.reduce((s, r) => s + r.unpaid, 0),
            total_umum: rows.reduce((s, r) => s + r.payment_umum, 0),
            total_bpjs: rows.reduce((s, r) => s + r.payment_bpjs, 0),
        }

        if (format === 'xlsx') {
            return generateExcelResponse([{
                name: 'Revenue Report',
                data: rows as any,
                columns: [
                    { header: 'Tanggal', key: 'date', width: 14 },
                    { header: 'Jumlah Invoice', key: 'total_invoices', width: 16 },
                    { header: 'Subtotal (Rp)', key: 'subtotal', width: 18 },
                    { header: 'Diskon (Rp)', key: 'discount', width: 14 },
                    { header: 'Pajak (Rp)', key: 'tax', width: 14 },
                    { header: 'Total (Rp)', key: 'total', width: 18 },
                    { header: 'Terbayar (Rp)', key: 'paid', width: 18 },
                    { header: 'Belum Bayar (Rp)', key: 'unpaid', width: 18 },
                    { header: 'Umum (Rp)', key: 'payment_umum', width: 16 },
                    { header: 'BPJS (Rp)', key: 'payment_bpjs', width: 16 },
                ],
            }], `laporan-pendapatan-${from}-${to}`)
        }

        return apiResponse.ok({ rows, summary, period: { from, to } })
    } catch {
        return apiResponse.serverError()
    }
}
