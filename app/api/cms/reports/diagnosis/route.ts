/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { rateLimit, RATE_LIMITS } from '@/lib/api/rate-limit'
import { requireOwner, isGuardError } from '@/lib/api/guards'
import { generateExcelResponse } from '@/lib/api/excel-export'
import * as Sentry from '@sentry/nextjs'

/**
 * GET /api/cms/reports/diagnosis
 * Diagnosis frequency report.
 * Auth: Owner only
 */
export async function GET(request: NextRequest) {
    const rl = await rateLimit(request, 'cms:report:dx', RATE_LIMITS.read)
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

        const { data: diagnoses, error } = await supabase
            .from('diagnoses')
            .select('icd10_code, icd10_display, diagnosis_type, created_at')
            .gte('created_at', `${from}T00:00:00`)
            .lte('created_at', `${to}T23:59:59`)

        if (error) {
            console.error('Diagnosis report error:', error)
            Sentry.captureException(error)
            return apiResponse.serverError('Failed to fetch diagnosis data')
        }

        // Aggregate by ICD-10 code
        const dxMap = new Map<string, any>()
        for (const dx of diagnoses ?? []) {
            const existing = dxMap.get(dx.icd10_code) ?? {
                icd10_code: dx.icd10_code,
                icd10_display: dx.icd10_display,
                total: 0,
                primary_count: 0,
                secondary_count: 0,
            }
            existing.total++
            if (dx.diagnosis_type === 'primary') existing.primary_count++
            else existing.secondary_count++
            dxMap.set(dx.icd10_code, existing)
        }

        const rows = Array.from(dxMap.values()).sort((a, b) => b.total - a.total)

        const summary = {
            total_diagnoses: rows.reduce((s, r) => s + r.total, 0),
            unique_codes: rows.length,
            top_10: rows.slice(0, 10).map(r => ({ code: r.icd10_code, display: r.icd10_display, count: r.total })),
        }

        if (format === 'xlsx') {
            return generateExcelResponse([{
                name: 'Diagnosis Report',
                data: rows,
                columns: [
                    { header: 'Kode ICD-10', key: 'icd10_code', width: 14 },
                    { header: 'Nama Diagnosis', key: 'icd10_display', width: 40 },
                    { header: 'Total', key: 'total', width: 10 },
                    { header: 'Primer', key: 'primary_count', width: 10 },
                    { header: 'Sekunder', key: 'secondary_count', width: 12 },
                ],
            }], `laporan-diagnosis-${from}-${to}`)
        }

        return apiResponse.ok({ rows, summary, period: { from, to } })
    } catch {
        return apiResponse.serverError()
    }
}
