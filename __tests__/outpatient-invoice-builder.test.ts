/**
 * Unit tests — buildInvoiceFromEncounter (rawat jalan / outpatient)
 * Tier 1: Billing logic kritis
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildInvoiceFromEncounter } from '@/lib/api/invoice-builder'

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function makeMockSupabase(overrides: Record<string, any> = {}) {
  const defaults = {
    organizations: { data: { medical_fee: 100_000 }, error: null },
    procedures: { data: [], error: null },
    lab_orders: { data: [], error: null },
    prescriptions: { data: [], error: null },
    stock_movements: { data: null, error: null },
  }
  const db = { ...defaults, ...overrides }

  const chainable = (tableName: string) => {
    const row = db[tableName as keyof typeof db] ?? { data: null, error: null }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(row),
      maybeSingle: vi.fn().mockResolvedValue(row),
      then: undefined as any,
      // For array results (procedures, lab_orders, prescriptions)
      // vitest resolves the promise when awaited on the chain itself
    }
  }

  const supabase = {
    from: vi.fn((table: string) => {
      const row = db[table as keyof typeof db] ?? { data: [], error: null }
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(row),
        maybeSingle: vi.fn().mockResolvedValue(row),
      }
      // make await on chain itself return the row (for queries without .single())
      chain[Symbol.for('nodejs.rejection')] = undefined
      chain.then = (resolve: any) => Promise.resolve(row).then(resolve)
      return chain
    }),
  }
  return supabase as any
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildInvoiceFromEncounter — rawat jalan', () => {
  const ENC_ID = 'enc-001'
  const ORG_ID = 'org-001'

  it('Konsultasi saja — tanpa prosedur/lab/obat', async () => {
    const supabase = makeMockSupabase({
      organizations: { data: { medical_fee: 100_000 }, error: null },
      procedures: { data: [], error: null },
      lab_orders: { data: [], error: null },
      prescriptions: { data: [], error: null },
    })

    const result = await buildInvoiceFromEncounter(supabase, ENC_ID, ORG_ID)

    expect(result.items).toHaveLength(1)
    expect(result.items[0].item_type).toBe('consultation')
    expect(result.items[0].unit_price).toBe(100_000)
    expect(result.subtotal).toBe(100_000)
    expect(result.total_amount).toBe(100_000)
    expect(result.discount_amount).toBe(0)
    expect(result.tax_amount).toBe(0)
  })

  it('Fallback consultation fee 50.000 jika org tidak punya medical_fee', async () => {
    const supabase = makeMockSupabase({
      organizations: { data: null, error: null },
    })

    const result = await buildInvoiceFromEncounter(supabase, ENC_ID, ORG_ID)

    expect(result.items[0].unit_price).toBe(50_000)
    expect(result.subtotal).toBe(50_000)
  })

  it('Konsultasi + 2 prosedur completed → 3 items', async () => {
    const supabase = makeMockSupabase({
      organizations: { data: { medical_fee: 100_000 }, error: null },
      procedures: {
        data: [
          { id: 'proc-1', procedure_code: 'P001', procedure_display: 'Pemasangan Infus' },
          { id: 'proc-2', procedure_code: 'P002', procedure_display: 'Injeksi IV' },
        ],
        error: null,
      },
      lab_orders: { data: [], error: null },
      prescriptions: { data: [], error: null },
    })

    const result = await buildInvoiceFromEncounter(supabase, ENC_ID, ORG_ID)

    expect(result.items).toHaveLength(3)
    expect(result.items.filter(i => i.item_type === 'action')).toHaveLength(2)
    expect(result.subtotal).toBe(100_000 + 50_000 + 50_000)
  })

  it('Konsultasi + 1 lab order dengan 2 item → 3 items', async () => {
    const supabase = makeMockSupabase({
      organizations: { data: { medical_fee: 100_000 }, error: null },
      procedures: { data: [], error: null },
      lab_orders: {
        data: [{
          id: 'lab-1',
          lab_order_items: [
            { id: 'li-1', test_name: 'Hemoglobin', loinc_code: '718-7' },
            { id: 'li-2', test_name: 'Leukosit', loinc_code: '6690-2' },
          ],
        }],
        error: null,
      },
      prescriptions: { data: [], error: null },
    })

    const result = await buildInvoiceFromEncounter(supabase, ENC_ID, ORG_ID)

    expect(result.items).toHaveLength(3)
    expect(result.items.filter(i => i.item_type === 'lab')).toHaveLength(2)
    expect(result.subtotal).toBe(100_000 + 75_000 + 75_000)
  })

  it('Total amount = subtotal - discount + tax (semua 0 untuk rawat jalan)', async () => {
    const supabase = makeMockSupabase({
      organizations: { data: { medical_fee: 200_000 }, error: null },
      procedures: { data: [], error: null },
      lab_orders: { data: [], error: null },
      prescriptions: { data: [], error: null },
    })

    const result = await buildInvoiceFromEncounter(supabase, ENC_ID, ORG_ID)

    expect(result.total_amount).toBe(result.subtotal - result.discount_amount + result.tax_amount)
    expect(result.discount_amount).toBe(0)
    expect(result.tax_amount).toBe(0)
  })
})
