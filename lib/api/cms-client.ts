/**
 * lib/api/cms-client.ts
 *
 * API client for CMS-specific operations.
 * Follows the same fetchJson pattern as the main client.ts.
 */

import type {
    StaffMember,
    StaffCreateInput,
    StaffUpdateInput,
    CmsContentSection,
    CmsSectionKey,
    PurchaseOrderSummary,
    ReportFilter,
} from '@/lib/types/cms'

// ---------------------------------------------------------------------------
// Internal helpers (same as main client)
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...init,
    })
    const json = await res.json()
    if (!json.success) {
        throw new Error(json.error ?? `Request failed: ${res.status}`)
    }
    return json.data as T
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    if (!entries.length) return ''
    return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
}

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export async function getCmsOrganization() {
    return fetchJson('/api/cms/organization')
}

export async function updateCmsOrganization(updates: Record<string, unknown>) {
    return fetchJson('/api/cms/organization', {
        method: 'PUT',
        body: JSON.stringify(updates),
    })
}

// ---------------------------------------------------------------------------
// Poli / Services
// ---------------------------------------------------------------------------

export async function getCmsPoliServices() {
    return fetchJson('/api/cms/poli')
}

export async function createPoliService(data: {
    name: string
    code: string
    location_id: string
    speciality_code?: string
    quota_per_day?: number
}) {
    return fetchJson('/api/cms/poli', {
        method: 'POST',
        body: JSON.stringify(data),
    })
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export async function getStaff(opts?: { role?: string; active?: boolean }): Promise<StaffMember[]> {
    return fetchJson(`/api/cms/staff${qs(opts ?? {})}`)
}

export async function getStaffMember(id: string): Promise<StaffMember> {
    return fetchJson(`/api/cms/staff/${id}`)
}

export async function createStaff(input: StaffCreateInput): Promise<StaffMember> {
    return fetchJson('/api/cms/staff', {
        method: 'POST',
        body: JSON.stringify(input),
    })
}

export async function updateStaff(id: string, input: StaffUpdateInput): Promise<StaffMember> {
    return fetchJson(`/api/cms/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
    })
}

export async function deleteStaff(id: string): Promise<StaffMember> {
    return fetchJson(`/api/cms/staff/${id}`, { method: 'DELETE' })
}

// ---------------------------------------------------------------------------
// CMS Content (Landing Page)
// ---------------------------------------------------------------------------

export async function getCmsContent(): Promise<CmsContentSection[]> {
    return fetchJson('/api/cms/content')
}

export async function updateCmsContent(
    section_key: CmsSectionKey,
    content: Record<string, unknown>,
): Promise<CmsContentSection> {
    return fetchJson('/api/cms/content', {
        method: 'PUT',
        body: JSON.stringify({ section_key, content }),
    })
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function getReport<T = unknown>(
    type: 'revenue' | 'patient-visits' | 'medications' | 'lab' | 'diagnosis',
    filter?: ReportFilter,
): Promise<T> {
    return fetchJson(`/api/cms/reports/${type}${qs({ ...filter })}`)
}

export async function downloadReportExcel(
    type: 'revenue' | 'patient-visits' | 'medications' | 'lab' | 'diagnosis',
    filter?: ReportFilter,
): Promise<void> {
    const params = { ...filter, format: 'xlsx' } as Record<string, string>
    const url = `/api/cms/reports/${type}${qs(params)}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Download failed')
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `report-${type}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
}

// ---------------------------------------------------------------------------
// Purchase Orders
// ---------------------------------------------------------------------------

export async function getPurchaseOrders(status?: string): Promise<PurchaseOrderSummary[]> {
    return fetchJson(`/api/cms/po-approval${qs({ status })}`)
}

export async function approvePO(id: string): Promise<unknown> {
    return fetchJson(`/api/cms/po-approval/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'approve' }),
    })
}

export async function rejectPO(id: string, rejection_reason?: string): Promise<unknown> {
    return fetchJson(`/api/cms/po-approval/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'reject', rejection_reason }),
    })
}

// ---------------------------------------------------------------------------
// Dashboard Stats
// ---------------------------------------------------------------------------

export async function getCmsDashboardStats(): Promise<{
    totalPatients: number
    todayVisits: number
    totalStaff: number
    monthRevenue: number
}> {
    // Aggregate from multiple endpoints
    const [org, staff] = await Promise.allSettled([
        getCmsOrganization(),
        getStaff(),
    ])

    return {
        totalPatients: 0, // Will be fetched from encounters
        todayVisits: 0,
        totalStaff: staff.status === 'fulfilled' ? (staff.value as StaffMember[]).length : 0,
        monthRevenue: 0,
    }
}
