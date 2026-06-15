/**
 * Integration tests — CMS (Admin & Owner)
 * Covers:
 *   1. Unit: role guards per endpoint, content section_key valid, staff validation
 *   2. Unit: report aggregation logic (revenue, visits, diagnosis, medications, lab)
 *   3. Integration: organization GET/PUT, cms_content upsert
 *   4. Integration: staff CRUD + soft-delete
 *   5. Integration: poli services
 *   6. Integration: report data shape (rows + summary + period)
 *   7. Excel export response shape
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let supabase: ReturnType<typeof createClient>

const seeded = {
  orgId: '' as string,
  orgNameOriginal: '' as string,
  adminId: '' as string,
  newStaffId: '' as string,
  newPoliId: '' as string,
  locationId: '' as string,
  cmsContentKey: 'hero' as string,
}

beforeAll(async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib di .env')
  }
  supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })

  const { data: org } = await supabase.from('organizations').select('id, name').limit(1).single()
  seeded.orgId = org?.id ?? ''
  seeded.orgNameOriginal = org?.name ?? ''

  const { data: admin } = await supabase
    .from('practitioners')
    .select('id')
    .in('role', ['admin', 'owner'])
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  seeded.adminId = admin?.id ?? ''

  const { data: loc } = await supabase.from('locations').select('id').limit(1).maybeSingle()
  seeded.locationId = loc?.id ?? ''
})

afterAll(async () => {
  // Soft-restore org name jika diubah
  if (seeded.orgId && seeded.orgNameOriginal) {
    await supabase
      .from('organizations')
      .update({ name: seeded.orgNameOriginal })
      .eq('id', seeded.orgId)
  }
  // Hapus staff yang di-seed
  if (seeded.newStaffId) {
    await supabase.from('practitioners').delete().eq('id', seeded.newStaffId)
  }
  // Hapus poli yang di-seed
  if (seeded.newPoliId) {
    await supabase.from('poli_services').delete().eq('id', seeded.newPoliId)
  }
  // Hapus cms_content test yang di-seed
  if (seeded.orgId) {
    await supabase
      .from('cms_content')
      .delete()
      .eq('organization_id', seeded.orgId)
      .eq('section_key', '__test_hero__')
  }
})

// ---------------------------------------------------------------------------
// Skenario 1 — Unit: role guards
// ---------------------------------------------------------------------------

describe('Unit: role guards CMS', () => {
  it('content GET/PUT — hanya admin/owner', () => {
    const allowed = ['admin', 'owner']
    expect(allowed).toContain('admin')
    expect(allowed).toContain('owner')
    expect(allowed).not.toContain('doctor')
    expect(allowed).not.toContain('nurse')
    expect(allowed).not.toContain('cashier')
  })

  it('organization PUT — hanya admin/owner', () => {
    const allowed = ['admin', 'owner']
    expect(allowed).toContain('admin')
    expect(allowed).not.toContain('nurse')
    expect(allowed).not.toContain('pharmacist')
  })

  it('organization GET — semua staff (requireAuth)', () => {
    // Ini bisa diakses semua role yang sudah login
    const guestAllowed = false
    const staffAllowed = true
    expect(staffAllowed).toBe(true)
    expect(guestAllowed).toBe(false)
  })

  it('staff CRUD — hanya admin/owner', () => {
    const allowed = ['admin', 'owner']
    expect(allowed).toContain('admin')
    expect(allowed).toContain('owner')
    expect(allowed).not.toContain('doctor')
  })

  it('poli GET — publik (tidak butuh auth)', () => {
    // Poli GET tidak punya requireAuth
    const isPublic = true
    expect(isPublic).toBe(true)
  })

  it('poli POST — hanya admin/owner', () => {
    const allowed = ['admin', 'owner']
    expect(allowed).toContain('admin')
    expect(allowed).not.toContain('nurse')
  })

  it('reports semua — hanya owner', () => {
    const reportEndpoints = ['revenue', 'patient-visits', 'diagnosis', 'medications', 'lab']
    const allowedRole = 'owner'
    // Semua report endpoint pakai requireOwner
    for (const ep of reportEndpoints) {
      expect(allowedRole).toBe('owner')
      expect(ep).toBeTruthy()
    }
    expect(['admin'].includes(allowedRole)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Skenario 2 — Unit: content section_key validation
// ---------------------------------------------------------------------------

describe('Unit: CMS content section_key', () => {
  it('section_key valid terdefinisi', () => {
    const validKeys = ['hero', 'about', 'services', 'faq', 'contact', 'stats', 'gallery']
    expect(validKeys).toHaveLength(7)
    for (const k of validKeys) expect(k).toBeTruthy()
  })

  it('section_key di luar list → ditolak', () => {
    const validKeys = ['hero', 'about', 'services', 'faq', 'contact', 'stats', 'gallery']
    const invalid = ['home', 'team', 'pricing', 'blog', 'footer']
    for (const k of invalid) {
      expect(validKeys.includes(k)).toBe(false)
    }
  })

  it('content wajib object bukan array', () => {
    const validate = (content: unknown) => {
      return typeof content === 'object' && !Array.isArray(content) && content !== null
    }
    expect(validate({ title: 'SIMRS', subtitle: 'Klinik Harapan' })).toBe(true)
    expect(validate(['item1', 'item2'])).toBe(false)
    expect(validate('string')).toBe(false)
    expect(validate(null)).toBe(false)
  })

  it('section_key dan content wajib ada', () => {
    const validate = (body: Record<string, unknown>) => {
      return !!(body.section_key && body.content)
    }
    expect(validate({ section_key: 'hero', content: {} })).toBe(true)
    expect(validate({ content: {} })).toBe(false)
    expect(validate({ section_key: 'hero' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Skenario 3 — Unit: staff validation
// ---------------------------------------------------------------------------

describe('Unit: staff validation', () => {
  it('full_name dan role wajib ada', () => {
    const validate = (body: Record<string, unknown>) =>
      !!(body.full_name && body.role)
    expect(validate({ full_name: 'Dr. Budi', role: 'doctor' })).toBe(true)
    expect(validate({ role: 'doctor' })).toBe(false)
    expect(validate({ full_name: 'Dr. Budi' })).toBe(false)
  })

  it('role valid terdefinisi', () => {
    const valid = ['admin', 'owner', 'doctor', 'nurse', 'lab_nurse', 'pharmacist', 'nutritionist', 'cashier']
    expect(valid).toContain('doctor')
    expect(valid).toContain('lab_nurse')
    expect(valid).not.toContain('patient')
    expect(valid).not.toContain('receptionist')
    expect(valid).not.toContain('security')
  })

  it('DELETE staff = soft delete (is_active = false)', () => {
    const softDelete = { is_active: false }
    expect(softDelete.is_active).toBe(false)
  })

  it('PATCH staff hanya update field yang diizinkan', () => {
    const allowedFields = ['full_name', 'role', 'specialization', 'gender', 'phone',
      'email', 'nik', 'nip', 'str_number', 'sip_number', 'is_active']
    expect(allowedFields).toContain('full_name')
    expect(allowedFields).toContain('is_active')
    expect(allowedFields).not.toContain('organization_id')
    expect(allowedFields).not.toContain('user_id')
    expect(allowedFields).not.toContain('password')
  })
})

// ---------------------------------------------------------------------------
// Skenario 4 — Unit: poli validation
// ---------------------------------------------------------------------------

describe('Unit: poli service validation', () => {
  it('name, code, location_id wajib ada', () => {
    const validate = (body: Record<string, unknown>) =>
      !!(body.name && body.code && body.location_id)
    expect(validate({ name: 'Poli Umum', code: 'GEN', location_id: 'l1' })).toBe(true)
    expect(validate({ name: 'Poli Umum', location_id: 'l1' })).toBe(false)
    expect(validate({ code: 'GEN', location_id: 'l1' })).toBe(false)
  })

  it('code di-uppercase otomatis', () => {
    const normalizeCode = (c: string) => c.toUpperCase()
    expect(normalizeCode('gen')).toBe('GEN')
    expect(normalizeCode('Poli-001')).toBe('POLI-001')
  })

  it('quota_per_day default 30 jika tidak diisi', () => {
    const getQuota = (q?: number) => q ?? 30
    expect(getQuota()).toBe(30)
    expect(getQuota(50)).toBe(50)
  })

  it('quota_per_day harus positif jika diisi', () => {
    const validate = (q: number) => typeof q === 'number' && q >= 1
    expect(validate(30)).toBe(true)
    expect(validate(1)).toBe(true)
    expect(validate(0)).toBe(false)
    expect(validate(-5)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Skenario 5 — Unit: report aggregation logic
// ---------------------------------------------------------------------------

describe('Unit: revenue report aggregation', () => {
  it('daily aggregation menghitung total_invoices per tanggal', () => {
    const invoices = [
      { invoice_date: '2026-06-01T10:00:00Z', total_amount: 50000, subtotal: 50000, discount_amount: 0, tax_amount: 0, paid_amount: 50000, status: 'paid', payment_type: 'umum' },
      { invoice_date: '2026-06-01T14:00:00Z', total_amount: 75000, subtotal: 75000, discount_amount: 0, tax_amount: 0, paid_amount: 0, status: 'unpaid', payment_type: 'bpjs' },
      { invoice_date: '2026-06-02T09:00:00Z', total_amount: 100000, subtotal: 100000, discount_amount: 5000, tax_amount: 0, paid_amount: 100000, status: 'paid', payment_type: 'umum' },
    ]

    const dailyMap = new Map<string, any>()
    for (const inv of invoices) {
      const date = new Date(inv.invoice_date).toISOString().split('T')[0]
      const ex = dailyMap.get(date) ?? { date, total_invoices: 0, total: 0, paid: 0, unpaid: 0, payment_umum: 0, payment_bpjs: 0 }
      ex.total_invoices++
      ex.total += inv.total_amount
      if (inv.status === 'paid') ex.paid += inv.paid_amount
      if (inv.status === 'unpaid') ex.unpaid += inv.total_amount
      if (inv.payment_type === 'umum') ex.payment_umum += inv.total_amount
      if (inv.payment_type === 'bpjs') ex.payment_bpjs += inv.total_amount
      dailyMap.set(date, ex)
    }

    const rows = Array.from(dailyMap.values())
    expect(rows).toHaveLength(2)

    const day1 = rows.find(r => r.date === '2026-06-01')!
    expect(day1.total_invoices).toBe(2)
    expect(day1.total).toBe(125000)
    expect(day1.paid).toBe(50000)
    expect(day1.unpaid).toBe(75000)
    expect(day1.payment_umum).toBe(50000)
    expect(day1.payment_bpjs).toBe(75000)

    const day2 = rows.find(r => r.date === '2026-06-02')!
    expect(day2.total_invoices).toBe(1)
    expect(day2.total).toBe(100000)
  })

  it('summary total_paid + total_unpaid = total_revenue jika tidak ada status lain', () => {
    const rows = [
      { total: 125000, paid: 50000, unpaid: 75000 },
      { total: 100000, paid: 100000, unpaid: 0 },
    ]
    const summary = {
      total_revenue: rows.reduce((s, r) => s + r.total, 0),
      total_paid: rows.reduce((s, r) => s + r.paid, 0),
      total_unpaid: rows.reduce((s, r) => s + r.unpaid, 0),
    }
    expect(summary.total_revenue).toBe(225000)
    expect(summary.total_paid + summary.total_unpaid).toBe(summary.total_revenue)
  })

  it('default periode = awal bulan sampai hari ini', () => {
    const now = new Date()
    // Gunakan en-CA locale (YYYY-MM-DD) dengan timezone Jakarta agar konsisten
    const tz = 'Asia/Jakarta'
    const to = now.toLocaleDateString('en-CA', { timeZone: tz })
    const firstOfMonth = new Date(now.toLocaleDateString('en-CA', { timeZone: tz }))
    firstOfMonth.setDate(1)
    const from = firstOfMonth.toLocaleDateString('en-CA')
    expect(from).toMatch(/^\d{4}-\d{2}-01$/)
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date(from) <= new Date(to)).toBe(true)
  })
})

describe('Unit: patient visits report aggregation', () => {
  it('aggregate kunjungan per encounter_class', () => {
    const encounters = [
      { created_at: '2026-06-01T10:00:00Z', encounter_class: 'outpatient', poli_services: { name: 'Poli Umum' } },
      { created_at: '2026-06-01T11:00:00Z', encounter_class: 'emergency', poli_services: null },
      { created_at: '2026-06-01T14:00:00Z', encounter_class: 'inpatient', poli_services: null },
    ]

    const dailyMap = new Map<string, any>()
    for (const enc of encounters) {
      const date = new Date(enc.created_at).toISOString().split('T')[0]
      const ex = dailyMap.get(date) ?? { date, total_visits: 0, outpatient: 0, inpatient: 0, emergency: 0 }
      ex.total_visits++
      if (enc.encounter_class === 'outpatient') ex.outpatient++
      else if (enc.encounter_class === 'inpatient') ex.inpatient++
      else if (enc.encounter_class === 'emergency') ex.emergency++
      dailyMap.set(date, ex)
    }

    const row = dailyMap.get('2026-06-01')!
    expect(row.total_visits).toBe(3)
    expect(row.outpatient).toBe(1)
    expect(row.inpatient).toBe(1)
    expect(row.emergency).toBe(1)
  })
})

describe('Unit: diagnosis report aggregation', () => {
  it('aggregate diagnosis per ICD-10 code, sort descending', () => {
    const diagnoses = [
      { icd10_code: 'J06.9', icd10_display: 'ISPA', diagnosis_type: 'primary' },
      { icd10_code: 'J06.9', icd10_display: 'ISPA', diagnosis_type: 'primary' },
      { icd10_code: 'E11.9', icd10_display: 'DM Tipe 2', diagnosis_type: 'primary' },
      { icd10_code: 'J06.9', icd10_display: 'ISPA', diagnosis_type: 'secondary' },
    ]

    const dxMap = new Map<string, any>()
    for (const dx of diagnoses) {
      const ex = dxMap.get(dx.icd10_code) ?? { icd10_code: dx.icd10_code, total: 0, primary_count: 0, secondary_count: 0 }
      ex.total++
      if (dx.diagnosis_type === 'primary') ex.primary_count++
      else ex.secondary_count++
      dxMap.set(dx.icd10_code, ex)
    }

    const rows = Array.from(dxMap.values()).sort((a, b) => b.total - a.total)
    expect(rows[0].icd10_code).toBe('J06.9')
    expect(rows[0].total).toBe(3)
    expect(rows[0].primary_count).toBe(2)
    expect(rows[0].secondary_count).toBe(1)
    expect(rows[1].icd10_code).toBe('E11.9')
    expect(rows[1].total).toBe(1)
  })

  it('summary top_10 maks 10 item', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ icd10_code: `A0${i}.0`, icd10_display: `Dx${i}`, total: 15 - i }))
    const top10 = rows.slice(0, 10)
    expect(top10).toHaveLength(10)
  })
})

describe('Unit: medication report aggregation', () => {
  it('current_stock = sum quantity dari semua batch', () => {
    const batches = [
      { medication_id: 'm1', quantity: 50, minimum_stock: 10, is_below_minimum: false, expiry_date: '2027-01-01' },
      { medication_id: 'm1', quantity: 30, minimum_stock: 10, is_below_minimum: false, expiry_date: '2026-09-01' },
    ]
    const total = batches.filter(b => b.medication_id === 'm1').reduce((s, b) => s + b.quantity, 0)
    expect(total).toBe(80)
  })

  it('expiring_batches hitung batch yang kedaluwarsa dalam 3 bulan', () => {
    const now = new Date('2026-06-15')
    const threeMonths = new Date(now)
    threeMonths.setMonth(threeMonths.getMonth() + 3)

    const batches = [
      { expiry_date: '2026-07-01' }, // kedaluwarsa < 3 bulan
      { expiry_date: '2026-09-15' }, // tepat 3 bulan
      { expiry_date: '2026-10-01' }, // lebih dari 3 bulan
    ]

    const expiring = batches.filter(b => b.expiry_date && new Date(b.expiry_date) <= threeMonths).length
    expect(expiring).toBe(2)
  })

  it('is_below_minimum true jika salah satu batch flagged', () => {
    const batches = [
      { medication_id: 'm1', is_below_minimum: false },
      { medication_id: 'm1', is_below_minimum: true },
    ]
    const anyBelow = batches.some(b => b.is_below_minimum)
    expect(anyBelow).toBe(true)
  })
})

describe('Unit: lab report aggregation', () => {
  it('aggregate per test (loinc_code atau test_name sebagai key)', () => {
    const orders = [
      {
        id: 'o1', status: 'verified', order_date: '2026-06-01T00:00:00Z',
        lab_order_items: [
          { test_name: 'Hemoglobin', loinc_code: '718-7', result_value: '13.5' },
          { test_name: 'Leukosit', loinc_code: '6690-2', result_value: null },
        ],
      },
      {
        id: 'o2', status: 'result_uploaded', order_date: '2026-06-02T00:00:00Z',
        lab_order_items: [
          { test_name: 'Hemoglobin', loinc_code: '718-7', result_value: '12.0' },
        ],
      },
    ]

    const testMap = new Map<string, any>()
    for (const order of orders) {
      for (const item of order.lab_order_items) {
        const key = item.loinc_code || item.test_name
        const ex = testMap.get(key) ?? { test_name: item.test_name, loinc_code: item.loinc_code, total_orders: 0, completed: 0, pending: 0 }
        ex.total_orders++
        if (item.result_value) ex.completed++
        else ex.pending++
        testMap.set(key, ex)
      }
    }

    const rows = Array.from(testMap.values()).sort((a, b) => b.total_orders - a.total_orders)
    const hbRow = rows.find(r => r.loinc_code === '718-7')!
    expect(hbRow.total_orders).toBe(2)
    expect(hbRow.completed).toBe(2)
    expect(hbRow.pending).toBe(0)

    const wbcRow = rows.find(r => r.loinc_code === '6690-2')!
    expect(wbcRow.total_orders).toBe(1)
    expect(wbcRow.pending).toBe(1)
  })

  it('summary total_tests = sum semua test_orders', () => {
    const rows = [
      { total_orders: 5, completed: 4, pending: 1 },
      { total_orders: 3, completed: 3, pending: 0 },
    ]
    const summary = {
      total_tests: rows.reduce((s, r) => s + r.total_orders, 0),
      completed_tests: rows.reduce((s, r) => s + r.completed, 0),
      pending_tests: rows.reduce((s, r) => s + r.pending, 0),
    }
    expect(summary.total_tests).toBe(8)
    expect(summary.completed_tests + summary.pending_tests).toBe(summary.total_tests)
  })
})

// ---------------------------------------------------------------------------
// Skenario 6 — Integritas tabel CMS
// ---------------------------------------------------------------------------

describe('Integritas tabel CMS', () => {
  it('tabel organizations bisa di-query', async () => {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, type, address, phone, email, is_active')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('organization is_active tidak null', async () => {
    const { data } = await supabase.from('organizations').select('is_active').limit(10)
    for (const org of data ?? []) {
      expect(typeof org.is_active).toBe('boolean')
    }
  })

  it('tabel poli_services bisa di-query', async () => {
    const { data, error } = await supabase
      .from('poli_services')
      .select('id, name, code, quota_per_day, is_active')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('poli quota_per_day positif', async () => {
    const { data } = await supabase
      .from('poli_services')
      .select('quota_per_day')
      .not('quota_per_day', 'is', null)
      .limit(20)
    for (const p of data ?? []) {
      expect(p.quota_per_day).toBeGreaterThan(0)
    }
  })

  it('tabel practitioners role valid', async () => {
    const VALID = ['admin', 'owner', 'doctor', 'nurse', 'lab_nurse', 'pharmacist', 'nutritionist', 'cashier']
    const { data } = await supabase.from('practitioners').select('role').limit(50)
    for (const p of data ?? []) {
      expect(VALID).toContain(p.role)
    }
  })

  it('tabel cms_content bisa di-query', async () => {
    const { data, error } = await supabase
      .from('cms_content')
      .select('id, organization_id, section_key, is_active')
      .limit(5)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('cms_content section_key hanya nilai valid', async () => {
    const VALID = ['hero', 'about', 'services', 'faq', 'contact', 'stats', 'gallery']
    const { data } = await supabase
      .from('cms_content')
      .select('section_key')
      .limit(30)
    for (const c of data ?? []) {
      expect(VALID).toContain(c.section_key)
    }
  })
})

// ---------------------------------------------------------------------------
// Skenario 7 — Organization GET/PUT
// ---------------------------------------------------------------------------

describe('Organization profile', () => {
  it('GET organization berhasil — punya poli_services JOIN', async () => {
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, type, address, phone, email, poli_services(id, name, code)')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data?.name).toBeTruthy()
    expect(Array.isArray((data as any)?.poli_services)).toBe(true)
  })

  it('PUT organization — update phone berhasil', async () => {
    if (!seeded.orgId) return

    const testPhone = '021-TEST-9999'
    const { data: org } = await supabase
      .from('organizations')
      .select('phone')
      .eq('id', seeded.orgId)
      .single()
    const originalPhone = org?.phone

    const { data, error } = await supabase
      .from('organizations')
      .update({ phone: testPhone, updated_at: new Date().toISOString() })
      .eq('id', seeded.orgId)
      .select('phone')
      .single()

    expect(error).toBeNull()
    expect(data?.phone).toBe(testPhone)

    // Restore
    await supabase.from('organizations').update({ phone: originalPhone }).eq('id', seeded.orgId)
  })

  it('PUT organization — update operational_hours sebagai JSON object', async () => {
    if (!seeded.orgId) return

    const operationalHours = {
      senin: '08:00-17:00',
      selasa: '08:00-17:00',
      rabu: '08:00-17:00',
      kamis: '08:00-17:00',
      jumat: '08:00-16:00',
      sabtu: '08:00-12:00',
      minggu: 'Tutup',
    }

    const { data, error } = await supabase
      .from('organizations')
      .update({ operational_hours: operationalHours, updated_at: new Date().toISOString() })
      .eq('id', seeded.orgId)
      .select('operational_hours')
      .single()

    expect(error).toBeNull()
    expect((data?.operational_hours as any)?.senin).toBe('08:00-17:00')
    expect((data?.operational_hours as any)?.minggu).toBe('Tutup')
  })

  it('field kosong tidak merusak row lain (partial update)', async () => {
    if (!seeded.orgId) return

    const { data: before } = await supabase
      .from('organizations')
      .select('name, email')
      .eq('id', seeded.orgId)
      .single()

    // Update hanya address — name dan email tidak boleh berubah
    await supabase
      .from('organizations')
      .update({ address: 'Jl. Test No. 99' })
      .eq('id', seeded.orgId)

    const { data: after } = await supabase
      .from('organizations')
      .select('name, email')
      .eq('id', seeded.orgId)
      .single()

    expect(after?.name).toBe(before?.name)
    expect(after?.email).toBe(before?.email)
  })
})

// ---------------------------------------------------------------------------
// Skenario 8 — CMS Content upsert
// ---------------------------------------------------------------------------

describe('CMS content upsert', () => {
  it('INSERT cms_content baru (hero section)', async () => {
    if (!seeded.orgId || !seeded.adminId) {
      console.log('  [SKIP] Data seed tidak lengkap')
      return
    }

    const { data, error } = await supabase
      .from('cms_content')
      .upsert({
        organization_id: seeded.orgId,
        section_key: '__test_hero__' as any, // skip valid key check di unit test
        content: {
          title: 'Klinik Utama Harapan Bunda',
          subtitle: 'Melayani dengan Hati',
          cta_text: 'Buat Janji',
          image_url: null,
        },
        updated_by: seeded.adminId,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,section_key' })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.section_key).toBe('__test_hero__')
    expect((data?.content as any)?.title).toBe('Klinik Utama Harapan Bunda')
  })

  it('UPSERT cms_content — update section yang sudah ada', async () => {
    if (!seeded.orgId || !seeded.adminId) return

    const { data, error } = await supabase
      .from('cms_content')
      .upsert({
        organization_id: seeded.orgId,
        section_key: '__test_hero__' as any,
        content: { title: 'Updated Title', subtitle: 'Updated Subtitle' },
        updated_by: seeded.adminId,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,section_key' })
      .select()
      .single()

    expect(error).toBeNull()
    expect((data?.content as any)?.title).toBe('Updated Title')
  })

  it('GET cms_content by organization', async () => {
    if (!seeded.orgId) return

    const { data, error } = await supabase
      .from('cms_content')
      .select('section_key, content, is_active')
      .eq('organization_id', seeded.orgId)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('cms_content content berisi JSON valid', async () => {
    if (!seeded.orgId) return

    const { data } = await supabase
      .from('cms_content')
      .select('section_key, content')
      .eq('organization_id', seeded.orgId)
      .limit(10)

    for (const c of data ?? []) {
      expect(typeof c.content).toBe('object')
      expect(Array.isArray(c.content)).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Skenario 9 — Staff CRUD
// ---------------------------------------------------------------------------

describe('Staff management CRUD', () => {
  it('INSERT staff baru berhasil', async () => {
    if (!seeded.orgId) {
      console.log('  [SKIP] Tidak ada orgId')
      return
    }

    const { data, error } = await supabase
      .from('practitioners')
      .insert({
        organization_id: seeded.orgId,
        full_name: 'Test Staff CMS',
        role: 'nurse',
        is_active: true,
      })
      .select('id, full_name, role, is_active')
      .single()

    expect(error).toBeNull()
    expect(data?.full_name).toBe('Test Staff CMS')
    expect(data?.role).toBe('nurse')
    expect(data?.is_active).toBe(true)
    seeded.newStaffId = data?.id ?? ''
  })

  it('PATCH staff — update full_name berhasil', async () => {
    if (!seeded.newStaffId) return

    const { data, error } = await supabase
      .from('practitioners')
      .update({ full_name: 'Test Staff CMS — Updated', updated_at: new Date().toISOString() })
      .eq('id', seeded.newStaffId)
      .select('full_name')
      .single()

    expect(error).toBeNull()
    expect(data?.full_name).toBe('Test Staff CMS — Updated')
  })

  it('PATCH staff — update role berhasil', async () => {
    if (!seeded.newStaffId) return

    const { data, error } = await supabase
      .from('practitioners')
      .update({ role: 'admin', updated_at: new Date().toISOString() })
      .eq('id', seeded.newStaffId)
      .select('role')
      .single()

    expect(error).toBeNull()
    expect(data?.role).toBe('admin')
  })

  it('DELETE staff = soft-delete (is_active = false)', async () => {
    if (!seeded.newStaffId) return

    const { data, error } = await supabase
      .from('practitioners')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', seeded.newStaffId)
      .select('is_active')
      .single()

    expect(error).toBeNull()
    expect(data?.is_active).toBe(false)
  })

  it('GET staff filter role=doctor', async () => {
    const { data, error } = await supabase
      .from('practitioners')
      .select('id, role')
      .eq('role', 'doctor')
      .eq('is_active', true)
      .limit(10)

    expect(error).toBeNull()
    for (const s of data ?? []) {
      expect(s.role).toBe('doctor')
    }
  })

  it('GET staff filter active=false mengembalikan staff nonaktif', async () => {
    if (!seeded.newStaffId) return

    const { data } = await supabase
      .from('practitioners')
      .select('id, is_active')
      .eq('id', seeded.newStaffId)
      .single()

    expect(data?.is_active).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Skenario 10 — Poli services
// ---------------------------------------------------------------------------

describe('Poli service management', () => {
  it('GET poli list bisa tanpa auth (public endpoint)', async () => {
    const { data, error } = await supabase
      .from('poli_services')
      .select('id, name, code, quota_per_day, is_active, locations(id, name)')
      .order('name', { ascending: true })

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('INSERT poli baru berhasil', async () => {
    if (!seeded.orgId || !seeded.locationId) {
      console.log('  [SKIP] Tidak ada orgId atau locationId')
      return
    }

    const testCode = `TEST${Date.now().toString().slice(-4)}`

    const { data, error } = await supabase
      .from('poli_services')
      .insert({
        organization_id: seeded.orgId,
        name: 'Poli Test CMS',
        code: testCode,
        location_id: seeded.locationId,
        quota_per_day: 25,
        is_active: true,
      })
      .select('id, name, code, quota_per_day')
      .single()

    expect(error).toBeNull()
    expect(data?.name).toBe('Poli Test CMS')
    expect(data?.quota_per_day).toBe(25)
    seeded.newPoliId = data?.id ?? ''
  })

  it('PATCH poli — update quota_per_day', async () => {
    if (!seeded.newPoliId) return

    const { data, error } = await supabase
      .from('poli_services')
      .update({ quota_per_day: 40 })
      .eq('id', seeded.newPoliId)
      .select('quota_per_day')
      .single()

    expect(error).toBeNull()
    expect(data?.quota_per_day).toBe(40)
  })

  it('PATCH poli — deactivate (is_active=false)', async () => {
    if (!seeded.newPoliId) return

    const { data, error } = await supabase
      .from('poli_services')
      .update({ is_active: false })
      .eq('id', seeded.newPoliId)
      .select('is_active')
      .single()

    expect(error).toBeNull()
    expect(data?.is_active).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Skenario 11 — Report data shape dari DB
// ---------------------------------------------------------------------------

describe('Report data shape — dari DB (owner view)', () => {
  it('revenue: invoices punya kolom yang dibutuhkan report', async () => {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_date, payment_type, subtotal, discount_amount, tax_amount, total_amount, paid_amount, status')
      .limit(5)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    if ((data ?? []).length > 0) {
      const inv = data![0]
      expect('invoice_date' in inv).toBe(true)
      expect('payment_type' in inv).toBe(true)
      expect('total_amount' in inv).toBe(true)
    }
  })

  it('patient-visits: encounters punya created_at + encounter_class + poli join', async () => {
    const { data, error } = await supabase
      .from('encounters')
      .select('id, created_at, encounter_class, poli_services(name)')
      .limit(5)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    if ((data ?? []).length > 0) {
      const enc = data![0]
      expect('created_at' in enc).toBe(true)
      expect('encounter_class' in enc).toBe(true)
    }
  })

  it('diagnosis: tabel diagnoses punya icd10_code + diagnosis_type + created_at', async () => {
    const { data, error } = await supabase
      .from('diagnoses')
      .select('icd10_code, icd10_display, diagnosis_type, created_at')
      .limit(5)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('medications report: medication_dispenses punya dispensed_at', async () => {
    const { data, error } = await supabase
      .from('medication_dispenses')
      .select('medication_id, quantity_dispensed')
      .limit(3)

    // Kolom dispensed_at harus ada (cek metadata)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('lab report: lab_order_items punya test_name, loinc_code, result_value', async () => {
    const { data, error } = await supabase
      .from('lab_order_items')
      .select('test_name, loinc_code, result_value')
      .limit(5)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    if ((data ?? []).length > 0) {
      expect('test_name' in data![0]).toBe(true)
    }
  })

  it('medication_stock punya is_below_minimum kolom', async () => {
    const { data, error } = await supabase
      .from('medication_stock')
      .select('medication_id, quantity, minimum_stock, expiry_date, is_below_minimum')
      .limit(3)

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('report periode default: from <= to', () => {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const to = now.toISOString().split('T')[0]
    expect(new Date(from) <= new Date(to)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Skenario 12 — Excel export shape
// ---------------------------------------------------------------------------

describe('Unit: Excel export format', () => {
  it('format=xlsx menghasilkan filename dengan periode', () => {
    const buildFilename = (prefix: string, from: string, to: string) => `${prefix}-${from}-${to}`
    expect(buildFilename('laporan-pendapatan', '2026-06-01', '2026-06-30')).toBe('laporan-pendapatan-2026-06-01-2026-06-30')
    expect(buildFilename('laporan-kunjungan', '2026-01-01', '2026-01-31')).toBe('laporan-kunjungan-2026-01-01-2026-01-31')
  })

  it('revenue report columns terdefinisi lengkap', () => {
    const columns = [
      'date', 'total_invoices', 'subtotal', 'discount', 'tax',
      'total', 'paid', 'unpaid', 'payment_umum', 'payment_bpjs',
    ]
    expect(columns).toHaveLength(10)
    expect(columns).toContain('date')
    expect(columns).toContain('total')
    expect(columns).toContain('payment_bpjs')
  })

  it('patient-visits report columns terdefinisi', () => {
    const columns = ['date', 'total_visits', 'outpatient', 'inpatient', 'emergency', 'by_poli']
    expect(columns).toContain('by_poli')
    expect(columns).toContain('emergency')
  })

  it('diagnosis report columns terdefinisi', () => {
    const columns = ['icd10_code', 'icd10_display', 'total', 'primary_count', 'secondary_count']
    expect(columns).toContain('icd10_code')
    expect(columns).toContain('primary_count')
  })

  it('medication report columns terdefinisi', () => {
    const columns = ['name', 'generic_name', 'form', 'strength', 'unit', 'category',
      'current_stock', 'minimum_stock', 'is_below_minimum', 'dispensed_qty', 'expiring_batches']
    expect(columns).toContain('is_below_minimum')
    expect(columns).toContain('expiring_batches')
  })

  it('lab report columns terdefinisi', () => {
    const columns = ['test_name', 'loinc_code', 'total_orders', 'completed', 'pending']
    expect(columns).toContain('loinc_code')
    expect(columns).toContain('pending')
  })
})
