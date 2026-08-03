/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireOwner, isGuardError } from '@/lib/api/guards'
import { generateExcelResponse } from '@/lib/api/excel-export'
import * as Sentry from '@sentry/nextjs'

/**
 * GET /api/cms/reports/patient-visits
 * Patient visit report grouped by date, poli, and encounter class.
 * Auth: Owner only
 */
export async function GET(request: NextRequest) {
    const rl = await rateLimit(request, 'cms:report:visits', RATE_LIMITS.read)
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

        const { data: encounters, error } = await supabase
            .from('encounters')
            .select('id, created_at, encounter_class, poli_service_id, poli_services(name)')
            .eq('organization_id', owner.practitioner.organization_id)
            .gte('created_at', `${from}T00:00:00`)
            .lte('created_at', `${to}T23:59:59`)
            .order('created_at', { ascending: true })

        if (error) {
            console.error('Visit report error:', error)
            Sentry.captureException(error)
            return apiResponse.serverError('Failed to fetch visit data')
        }

        // Aggregate by date
        const dailyMap = new Map<string, any>()
        const poliTotals = new Map<string, number>()

        for (const enc of encounters ?? []) {
            const date = new Date(enc.created_at).toISOString().split('T')[0]
            const existing = dailyMap.get(date) ?? {
                date,
                total_visits: 0,
                outpatient: 0,
                inpatient: 0,
                emergency: 0,
                by_poli: {} as Record<string, number>,
            }
            existing.total_visits++
            if (enc.encounter_class === 'outpatient') existing.outpatient++
            else if (enc.encounter_class === 'inpatient') existing.inpatient++
            else if (enc.encounter_class === 'emergency') existing.emergency++

            const poliName = (enc.poli_services as any)?.name
              ?? (enc.encounter_class === 'emergency' ? 'IGD'
                : enc.encounter_class === 'inpatient' ? 'Rawat Inap'
                : 'Lainnya')
            existing.by_poli[poliName] = (existing.by_poli[poliName] ?? 0) + 1
            poliTotals.set(poliName, (poliTotals.get(poliName) ?? 0) + 1)

            dailyMap.set(date, existing)
        }

        const rows = Array.from(dailyMap.values())
        const summary = {
            total_visits: rows.reduce((s, r) => s + r.total_visits, 0),
            total_outpatient: rows.reduce((s, r) => s + r.outpatient, 0),
            total_inpatient: rows.reduce((s, r) => s + r.inpatient, 0),
            total_emergency: rows.reduce((s, r) => s + r.emergency, 0),
            by_poli: Object.fromEntries(poliTotals),
        }

        if (format === 'xlsx') {
            const excelRows = rows.map(r => ({
                ...r,
                by_poli: Object.entries(r.by_poli as Record<string, number>).map(([k, v]) => `${k}: ${v}`).join(', ')
            }))
            return generateExcelResponse([{
                name: 'Patient Visits',
                data: excelRows,
                columns: [
                    { header: 'Tanggal', key: 'date', width: 14 },
                    { header: 'Total Kunjungan', key: 'total_visits', width: 16 },
                    { header: 'Rawat Jalan', key: 'outpatient', width: 14 },
                    { header: 'Rawat Inap', key: 'inpatient', width: 14 },
                    { header: 'IGD', key: 'emergency', width: 10 },
                    { header: 'Per Poli', key: 'by_poli', width: 40 },
                ],
            }], `laporan-kunjungan-${from}-${to}`)
        }

        return apiResponse.ok({ rows, summary, period: { from, to } })
    } catch {
        return apiResponse.serverError()
    }
}
