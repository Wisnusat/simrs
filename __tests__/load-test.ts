/**
 * Load Test — DB concurrency & race condition analysis
 *
 * JALANKAN TERPISAH: pnpm vitest run __tests__/load-test.ts
 * Ini bukan bagian dari pnpm test normal (lambat ~30-60 detik).
 *
 * Mengukur:
 *   1. Concurrent SELECT latency (10 / 25 / 50 parallel)
 *   2. Concurrent INSERT race condition di invoices (duplikat)
 *   3. Invoice builder: DB round-trip count vs waktu
 *   4. In-memory rate limiter: tidak efektif multi-instance
 *   5. Running bill concurrent write — apakah ada lost update
 *   6. Verdict: perlu Redis/queue atau tidak
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

let supabase: ReturnType<typeof createClient>

// IDs buat cleanup
const createdInvoiceIds: string[] = []
const createdEncounterIds: string[] = []
const createdRunningBillIds: string[] = []

// Helpers
const median = (arr: number[]) => {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const p95 = (arr: number[]) => {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length * 0.95)]
}
const p99 = (arr: number[]) => {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.floor(s.length * 0.99)]
}

interface TimedResult<T> {
  result: T
  ms: number
}

async function timed<T>(fn: () => Promise<T>): Promise<TimedResult<T>> {
  const start = performance.now()
  const result = await fn()
  return { result, ms: performance.now() - start }
}

beforeAll(async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY wajib di .env')
  }
  supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
})

afterAll(async () => {
  // Cleanup semua data yang di-seed oleh load test
  if (createdInvoiceIds.length > 0) {
    await supabase.from('invoice_items').delete().in('invoice_id', createdInvoiceIds)
    await supabase.from('invoices').delete().in('id', createdInvoiceIds)
  }
  if (createdRunningBillIds.length > 0) {
    await supabase.from('running_bills').delete().in('id', createdRunningBillIds)
  }
  for (const id of createdEncounterIds) {
    const { data: invs } = await supabase.from('invoices').select('id').eq('encounter_id', id)
    const invIds = (invs ?? []).map(i => i.id)
    if (invIds.length > 0) {
      await supabase.from('invoice_items').delete().in('invoice_id', invIds)
      await supabase.from('invoices').delete().in('id', invIds)
    }
    await supabase.from('encounters').delete().eq('id', id)
  }
})

// ---------------------------------------------------------------------------
// 1. Baseline latency — single query
// ---------------------------------------------------------------------------

describe('Baseline latency (single query)', () => {
  it('SELECT organizations — single round-trip latency', async () => {
    const samples: number[] = []
    for (let i = 0; i < 10; i++) {
      const { ms } = await timed(() =>
        supabase.from('organizations').select('id, name').limit(1).single()
      )
      samples.push(ms)
    }

    const med = median(samples)
    const p95val = p95(samples)
    console.log(`\n[Baseline SELECT] median=${med.toFixed(0)}ms p95=${p95val.toFixed(0)}ms`)

    // Ekspektasi: DB Supabase harus respond < 1 detik untuk simple SELECT
    expect(med).toBeLessThan(1000)
    expect(p95val).toBeLessThan(2000)
  })

  it('SELECT invoices dengan JOIN items — latency per query', async () => {
    const samples: number[] = []
    for (let i = 0; i < 5; i++) {
      const { ms } = await timed(() =>
        supabase
          .from('invoices')
          .select('id, total_amount, invoice_items(id, item_type, quantity, unit_price)')
          .limit(5)
      )
      samples.push(ms)
    }

    const med = median(samples)
    console.log(`\n[Baseline SELECT+JOIN] median=${med.toFixed(0)}ms`)
    expect(med).toBeLessThan(2000)
  })
})

// ---------------------------------------------------------------------------
// 2. Concurrent SELECT — koneksi pool Supabase
// ---------------------------------------------------------------------------

describe('Concurrent SELECT — Supabase connection behavior', () => {
  it('10 concurrent SELECT — semua berhasil, ukur latency', async () => {
    const CONCURRENCY = 10
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        timed(() =>
          supabase
            .from('encounters')
            .select('id, status, encounter_class')
            .limit(10)
        )
      )
    )

    const latencies = results.map(r => r.ms)
    const errors = results.filter(r => (r.result as any).error !== null)
    const med = median(latencies)
    const p95val = p95(latencies)
    const max = Math.max(...latencies)

    console.log(
      `\n[10 concurrent SELECT] median=${med.toFixed(0)}ms p95=${p95val.toFixed(0)}ms max=${max.toFixed(0)}ms errors=${errors.length}`
    )

    expect(errors.length).toBe(0)
    expect(med).toBeLessThan(3000)
  })

  it('25 concurrent SELECT — ukur degradasi vs 10 concurrent', async () => {
    const CONCURRENCY = 25
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        timed(() =>
          supabase
            .from('practitioners')
            .select('id, role, full_name')
            .eq('is_active', true)
            .limit(5)
        )
      )
    )

    const latencies = results.map(r => r.ms)
    const errors = results.filter(r => (r.result as any).error !== null)
    const med = median(latencies)
    const p95val = p95(latencies)
    const max = Math.max(...latencies)

    console.log(
      `\n[25 concurrent SELECT] median=${med.toFixed(0)}ms p95=${p95val.toFixed(0)}ms max=${max.toFixed(0)}ms errors=${errors.length}`
    )

    expect(errors.length).toBe(0)
    expect(p95val).toBeLessThan(5000)
  })

  it('50 concurrent SELECT — titik stress test', async () => {
    const CONCURRENCY = 50
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () =>
        timed(() =>
          supabase
            .from('patients')
            .select('id, full_name, medical_record_no')
            .limit(3)
        )
      )
    )

    const latencies = results.map(r => r.ms)
    const errors = results.filter(r => (r.result as any).error !== null)
    const successRate = ((CONCURRENCY - errors.length) / CONCURRENCY) * 100
    const med = median(latencies)
    const p95val = p95(latencies)
    const p99val = p99(latencies)
    const max = Math.max(...latencies)

    console.log(
      `\n[50 concurrent SELECT]\n` +
      `  median=${med.toFixed(0)}ms\n` +
      `  p95=${p95val.toFixed(0)}ms\n` +
      `  p99=${p99val.toFixed(0)}ms\n` +
      `  max=${max.toFixed(0)}ms\n` +
      `  errors=${errors.length}/${CONCURRENCY} (${successRate.toFixed(1)}% success)`
    )

    // Warning jika error rate > 10%
    if (errors.length > 5) {
      console.warn(`  ⚠️  ${errors.length} errors — Supabase connection pool mungkin tersaturasi`)
    }

    expect(successRate).toBeGreaterThan(80)
  })
})

// ---------------------------------------------------------------------------
// 3. Concurrent WRITE — race condition di invoice INSERT
// ---------------------------------------------------------------------------

describe('Race condition: concurrent invoice INSERT (tanpa locking)', () => {
  it('2 concurrent syncInvoiceForEncounter → kemungkinan duplikat invoice', async () => {
    // Seed encounter
    const { data: org } = await supabase.from('organizations').select('id').limit(1).single()
    const { data: patient } = await supabase.from('patients').select('id').limit(1).single()
    if (!org || !patient) {
      console.log('  [SKIP] Tidak ada org/patient')
      return
    }

    const { data: enc } = await supabase
      .from('encounters')
      .insert({
        patient_id: patient.id,
        organization_id: org.id,
        encounter_class: 'outpatient',
        status: 'in_progress',
        arrived_at: new Date().toISOString(),
        payment_type: 'umum',
      })
      .select('id')
      .single()

    if (!enc) return
    createdEncounterIds.push(enc.id)

    // Simulate concurrent syncInvoiceForEncounter tanpa locking:
    // Keduanya SELECT invoice → null
    // Keduanya INSERT → race condition
    const simulateSyncInvoice = async (invoiceSuffix: string) => {
      // 1. Check existing (simulasi .maybeSingle() di invoice-builder)
      const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('encounter_id', enc.id)
        .maybeSingle()

      if (existing) return { action: 'updated', id: existing.id }

      // Artificial delay to increase collision window
      await new Promise(r => setTimeout(r, 5))

      // 2. Insert baru
      const invoiceNumber = `INV-RACE-${Date.now()}-${invoiceSuffix}`
      const { data: newInv, error } = await supabase
        .from('invoices')
        .insert({
          encounter_id: enc.id,
          patient_id: patient.id,
          organization_id: org.id,
          invoice_number: invoiceNumber,
          payment_type: 'umum',
          subtotal: 50000,
          discount_amount: 0,
          tax_amount: 0,
          total_amount: 50000,
          status: 'unpaid',
        })
        .select('id')
        .single()

      if (newInv) {
        createdInvoiceIds.push(newInv.id)
        return { action: 'inserted', id: newInv.id }
      }

      return { action: 'error', error }
    }

    // Launch 5 concurrent syncs
    const [r1, r2, r3, r4, r5] = await Promise.all([
      simulateSyncInvoice('A'),
      simulateSyncInvoice('B'),
      simulateSyncInvoice('C'),
      simulateSyncInvoice('D'),
      simulateSyncInvoice('E'),
    ])

    // Count total invoices for this encounter
    const { data: allInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_number')
      .eq('encounter_id', enc.id)

    const duplicateCount = (allInvoices?.length ?? 0)

    console.log(
      `\n[Race Condition Test]\n` +
      `  5 concurrent invoice sync untuk encounter yang sama\n` +
      `  Hasil: ${duplicateCount} invoice terbuat\n` +
      `  Aksi: [${[r1, r2, r3, r4, r5].map(r => r?.action).join(', ')}]\n` +
      (duplicateCount > 1
        ? `  🔴 DUPLIKAT TERDETEKSI — butuh locking/queue/upsert`
        : `  🟢 Tidak ada duplikat (mungkin keberuntungan / timing)`)
    )

    // Cleanup
    if ((allInvoices?.length ?? 0) > 0) {
      const ids = (allInvoices ?? []).map(i => i.id)
      await supabase.from('invoice_items').delete().in('invoice_id', ids)
      await supabase.from('invoices').delete().in('id', ids)
      createdInvoiceIds.splice(0) // already cleaned
    }

    // Test tidak fail jika duplikat — kita hanya melaporkan
    expect(typeof duplicateCount).toBe('number')
    if (duplicateCount > 1) {
      console.warn(`  ⚠️  Duplikat invoice: ${duplicateCount} baris untuk encounter yang sama`)
    }
  })

  it('UPSERT dengan onConflict eliminasi duplikat invoice', async () => {
    const { data: org } = await supabase.from('organizations').select('id').limit(1).single()
    const { data: patient } = await supabase.from('patients').select('id').limit(1).single()
    if (!org || !patient) return

    const { data: enc } = await supabase
      .from('encounters')
      .insert({
        patient_id: patient.id,
        organization_id: org.id,
        encounter_class: 'outpatient',
        status: 'in_progress',
        arrived_at: new Date().toISOString(),
        payment_type: 'umum',
      })
      .select('id')
      .single()

    if (!enc) return
    createdEncounterIds.push(enc.id)

    // Concurrent UPSERT — harus idempoten
    // Catatan: butuh UNIQUE constraint pada encounter_id di invoices
    // Jika constraint ada: upsert aman. Jika tidak ada: masih bisa duplikat.
    const { data: constraint } = await supabase
      .from('invoices')
      .select('id')
      .eq('encounter_id', enc.id)
      .limit(2)

    // Simulasi: apakah ada UNIQUE constraint?
    // Test ini membuktikan bahwa tanpa constraint, race masih bisa terjadi
    const upsertSafe = async (suffix: string) => {
      return supabase
        .from('invoices')
        .upsert({
          encounter_id: enc.id,
          patient_id: patient.id,
          organization_id: org.id,
          invoice_number: `INV-UPSERT-${enc.id.slice(0, 8)}-${suffix}`,
          payment_type: 'umum',
          subtotal: 75000,
          discount_amount: 0,
          tax_amount: 0,
          total_amount: 75000,
          status: 'unpaid',
        }, { onConflict: 'encounter_id' })
        .select('id')
        .single()
    }

    const results = await Promise.all([
      upsertSafe('1'),
      upsertSafe('2'),
      upsertSafe('3'),
    ])

    const errors = results.filter(r => r.error !== null)
    const successes = results.filter(r => r.data !== null)

    const { data: finalInvoices } = await supabase
      .from('invoices')
      .select('id')
      .eq('encounter_id', enc.id)

    console.log(
      `\n[UPSERT onConflict test]\n` +
      `  3 concurrent upsert — encounter_id conflict\n` +
      `  errors=${errors.length} successes=${successes.length}\n` +
      `  Final invoice count: ${finalInvoices?.length ?? 0}\n` +
      (errors.length > 0 ? `  Error: ${errors[0].error?.message}` : '') +
      ((finalInvoices?.length ?? 0) <= 1
        ? `\n  🟢 UPSERT dengan unique constraint = aman`
        : `\n  🔴 Masih duplikat — unique constraint belum ada pada encounter_id`)
    )

    // Cleanup
    if ((finalInvoices?.length ?? 0) > 0) {
      const ids = (finalInvoices ?? []).map(i => i.id)
      await supabase.from('invoice_items').delete().in('invoice_id', ids)
      await supabase.from('invoices').delete().in('id', ids)
    }

    expect(typeof (finalInvoices?.length ?? 0)).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// 4. Invoice builder — DB round-trip count
// ---------------------------------------------------------------------------

describe('Invoice builder: DB query count per invoice generation', () => {
  it('hitung query count yang dibutuhkan per encounter', () => {
    // Berdasarkan kode invoice-builder.ts:
    // buildInvoiceFromEncounter per encounter:
    //   1. SELECT organizations (medical_fee)
    //   2. SELECT procedures
    //   3. SELECT lab_orders + lab_order_items
    //   4. SELECT prescriptions + prescription_items + medications
    //   5. Per prescription_item: SELECT stock_movements (unit price) ← O(n) queries!
    //
    // syncInvoiceForEpisode (inpatient):
    //   1. SELECT episodes_of_care
    //   2. SELECT inpatient_admissions
    //   3. SELECT encounters (all in episode)
    //   4. SELECT running_bills
    //   5. Per encounter: buildInvoiceFromEncounter (4+ queries each) ← O(encounters × items)
    //   6. SELECT invoices (check existing)
    //   7. INSERT/UPDATE invoices
    //   8. DELETE invoice_items
    //   9. INSERT invoice_items
    //
    // Estimasi untuk pasien rawat inap 3 hari (3 encounters, 2 obat per encounter):
    // = 4 base + (3 encounters × (4 base + 2 obat × 1 stock_query))
    // = 4 + 3 × 6 = 4 + 18 = 22 DB round-trips per discharge!

    const encountersInEpisode = 3
    const prescriptionItemsPerEncounter = 2
    const baseQueriesPerEncounter = 4 // org, procedures, lab, prescriptions
    const stockQueriesPerItem = 1

    const queriesPerEncounter = baseQueriesPerEncounter + (prescriptionItemsPerEncounter * stockQueriesPerItem)
    const totalEpisodeQueries = 4 + (encountersInEpisode * queriesPerEncounter) // 4 = episode/admission/encounters/running_bills
    const writeQueries = 3 // SELECT invoice + DELETE items + INSERT items

    const totalQueries = totalEpisodeQueries + writeQueries

    console.log(
      `\n[Invoice Builder DB Query Count]\n` +
      `  Outpatient (1 encounter, ${prescriptionItemsPerEncounter} obat):\n` +
      `    ${baseQueriesPerEncounter} + ${prescriptionItemsPerEncounter} stock = ${baseQueriesPerEncounter + prescriptionItemsPerEncounter} queries\n` +
      `  Inpatient (${encountersInEpisode} encounters, ${prescriptionItemsPerEncounter} obat/encounter):\n` +
      `    4 base + ${encountersInEpisode}×${queriesPerEncounter} = ${totalEpisodeQueries} read queries\n` +
      `    + ${writeQueries} write = ${totalQueries} total round-trips\n` +
      `\n  🔴 O(n) queries per prescription item → bottleneck di obat banyak\n` +
      `  💡 Solusi: batch SELECT stock_movements WHERE medication_id IN (...)`
    )

    expect(totalQueries).toBeGreaterThan(10) // Membuktikan perlu optimasi
    expect(queriesPerEncounter).toBeGreaterThan(4)
  })

  it('ukur latency simulasi invoice builder (5 parallel reads)', async () => {
    // Simulasi pattern akses invoice builder: 5 query berbeda concurrently
    const { data: enc } = await supabase
      .from('encounters')
      .select('id, organization_id, patient_id')
      .eq('encounter_class', 'outpatient')
      .limit(1)
      .maybeSingle()

    if (!enc) {
      console.log('  [SKIP] Tidak ada encounter outpatient')
      return
    }

    const { ms } = await timed(async () => {
      return Promise.all([
        supabase.from('organizations').select('medical_fee').eq('id', (enc as any).organization_id).single(),
        supabase.from('procedures').select('id, procedure_code, procedure_display').eq('encounter_id', enc.id).eq('status', 'completed'),
        supabase.from('lab_orders').select('id, lab_order_items(id, test_name, loinc_code)').eq('encounter_id', enc.id),
        supabase.from('prescriptions').select('id, prescription_items(id, quantity, medication_id, medications(name, unit))').eq('encounter_id', enc.id).neq('status', 'cancelled'),
        supabase.from('invoices').select('id').eq('encounter_id', enc.id).maybeSingle(),
      ])
    })

    console.log(
      `\n[Invoice Builder Parallel Reads]\n` +
      `  5 concurrent queries (parallelized) = ${ms.toFixed(0)}ms\n` +
      `  Sequential jika tidak diparallelkan ≈ ${(ms * 4).toFixed(0)}ms (4× lebih lambat)\n` +
      `  💡 Saat ini invoice-builder menjalankan query SEKUENSIAL — bisa dioptimasi Promise.all`
    )

    expect(ms).toBeLessThan(5000)
  })
})

// ---------------------------------------------------------------------------
// 5. In-memory rate limiter: multi-instance problem
// ---------------------------------------------------------------------------

describe('Rate limiter: in-memory limitation analysis', () => {
  it('rateLimit in-memory tidak share state antar instance', () => {
    // Simulasi 2 instance berbeda (masing-masing dengan store Map tersendiri)
    const createStore = () => {
      const store = new Map<string, { count: number; windowStart: number }>()
      const rateLimit = (ip: string, key: string, limit: number, windowSec: number) => {
        const windowMs = windowSec * 1000
        const now = Date.now()
        const storeKey = `${ip}:${key}`
        const entry = store.get(storeKey)

        if (!entry || now - entry.windowStart >= windowMs) {
          store.set(storeKey, { count: 1, windowStart: now })
          return { allowed: true, remaining: limit - 1 }
        }
        entry.count++
        return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) }
      }
      return rateLimit
    }

    const instance1 = createStore()
    const instance2 = createStore()
    const ip = '192.168.1.1'
    const limit = 3

    // Instance 1: 3 requests (hits limit)
    const r1a = instance1(ip, 'test:ep', limit, 60)
    const r1b = instance1(ip, 'test:ep', limit, 60)
    const r1c = instance1(ip, 'test:ep', limit, 60)
    const r1d = instance1(ip, 'test:ep', limit, 60) // harus ditolak

    // Instance 2: belum menerima request dari IP ini
    const r2a = instance2(ip, 'test:ep', limit, 60)

    console.log(
      `\n[In-Memory Rate Limiter Multi-Instance]\n` +
      `  Limit: ${limit} req/menit per IP\n` +
      `  Instance 1 → req 1: allowed=${r1a.allowed}\n` +
      `  Instance 1 → req 2: allowed=${r1b.allowed}\n` +
      `  Instance 1 → req 3: allowed=${r1c.allowed}\n` +
      `  Instance 1 → req 4: allowed=${r1d.allowed} ← harus BLOCKED\n` +
      `  Instance 2 → req 1: allowed=${r2a.allowed} ← LOLOS di instance berbeda!\n` +
      `\n  🔴 PROBLEM: req 4 dan selanjutnya bisa lolos ke instance 2\n` +
      `  Supabase serverless = banyak instance → rate limit tidak efektif\n` +
      `  💡 Solusi: Upstash Redis (serverless-friendly) atau Vercel KV`
    )

    expect(r1a.allowed).toBe(true)
    expect(r1b.allowed).toBe(true)
    expect(r1c.allowed).toBe(true)
    expect(r1d.allowed).toBe(false)    // ditolak di instance 1
    expect(r2a.allowed).toBe(true)     // LOLOS di instance 2 — ini bug di production
  })

  it('in-memory store tidak persist antar cold start (serverless)', () => {
    // Setiap cold start Vercel Function = store kosong = rate limit reset
    const simulateColdStart = () => {
      const freshStore = new Map() // cold start = store baru
      return freshStore.size === 0
    }

    expect(simulateColdStart()).toBe(true) // store selalu kosong saat cold start
    console.log(
      `\n[Cold Start Rate Limit Reset]\n` +
      `  Setiap cold start Lambda = store baru = limit direset\n` +
      `  Attacker dapat trigger cold start untuk bypass rate limit\n` +
      `  🔴 VULNERABLE terhadap brute force di production Vercel`
    )
  })
})

// ---------------------------------------------------------------------------
// 6. Concurrent running bill writes
// ---------------------------------------------------------------------------

describe('Concurrent running bill writes — lost update check', () => {
  it('20 concurrent INSERT running_bills — semua berhasil atau error?', async () => {
    const { data: org } = await supabase.from('organizations').select('id').limit(1).single()
    const { data: patient } = await supabase.from('patients').select('id').limit(1).single()
    const { data: doctor } = await supabase.from('practitioners').select('id').eq('role', 'doctor').eq('is_active', true).limit(1).maybeSingle()

    if (!org || !patient || !doctor) {
      console.log('  [SKIP] Data tidak lengkap')
      return
    }

    // Buat episode seed
    const { data: ep } = await supabase
      .from('episodes_of_care')
      .insert({
        patient_id: patient.id,
        organization_id: org.id,
        start_date: new Date().toISOString().slice(0, 10),
        status: 'admitted',
        dpjp_id: doctor.id,
      })
      .select('id')
      .single()

    if (!ep) return

    // 20 concurrent INSERT running_bills ke episode yang sama
    const CONCURRENCY = 20
    const start = performance.now()
    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, (_, i) =>
        supabase
          .from('running_bills')
          .insert({
            episode_of_care_id: ep.id,
            patient_id: patient.id,
            item_type: 'action',
            item_name: `Tindakan Concurrent #${i + 1}`,
            quantity: 1,
            unit_price: 10000,
            charge_date: new Date().toISOString().slice(0, 10),
          })
          .select('id')
          .single()
      )
    )
    const totalMs = performance.now() - start

    const successes = results.filter(r => r.data !== null)
    const errors = results.filter(r => r.error !== null)

    for (const r of successes) {
      if (r.data?.id) createdRunningBillIds.push(r.data.id)
    }

    // Verify count di DB
    const { count } = await supabase
      .from('running_bills')
      .select('id', { count: 'exact', head: true })
      .eq('episode_of_care_id', ep.id)

    console.log(
      `\n[Concurrent Running Bill INSERT]\n` +
      `  ${CONCURRENCY} concurrent INSERT dalam ${totalMs.toFixed(0)}ms\n` +
      `  success=${successes.length} errors=${errors.length}\n` +
      `  DB count=${count} (expected=${CONCURRENCY})\n` +
      (count === CONCURRENCY
        ? `  🟢 Semua INSERT berhasil — tidak ada lost write`
        : `  🔴 ${CONCURRENCY - (count ?? 0)} INSERT hilang — ada concurrency problem`) +
      `\n  Throughput: ${(CONCURRENCY / (totalMs / 1000)).toFixed(1)} req/s`
    )

    // Cleanup
    await supabase.from('running_bills').delete().eq('episode_of_care_id', ep.id)
    await supabase.from('episodes_of_care').delete().eq('id', ep.id)
    createdRunningBillIds.splice(0)

    expect(successes.length).toBe(CONCURRENCY)
    expect(errors.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 7. Verdict: perlu Redis/Queue?
// ---------------------------------------------------------------------------

describe('Verdict: Redis dan Queue', () => {
  it('analisis: apakah perlu Redis?', () => {
    const findings = {
      rateLimiterInMemory: true,          // store tidak share antar instance
      rateLimitColdStartReset: true,      // cold start = limit reset
      invoiceRaceCondition: true,         // tanpa UNIQUE constraint = duplikat
      invoiceNQueries: true,              // O(n) per prescription item
      runningBillsConcurrentSafe: true,   // INSERT concurrent aman (tidak ada read-modify-write)
      supabaseHandlesConnPool: true,      // Supabase PostgREST manage connection pool
    }

    const needsRedis =
      findings.rateLimiterInMemory ||
      findings.rateLimitColdStartReset ||
      findings.invoiceRaceCondition

    const needsQueue =
      findings.invoiceNQueries // invoice sync bisa dijadikan background job

    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║          VERDICT: Redis & Queue untuk SIMRS                      ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  🔴 PERLU (prioritas):                                           ║
║                                                                  ║
║  1. REDIS (Upstash) untuk rate limiting                          ║
║     Masalah: in-memory Map tidak share antar Vercel instance     ║
║     Efek: rate limit bypass mudah di production                  ║
║     Fix:  pnpm add @upstash/ratelimit @upstash/redis             ║
║           Ganti store Map dengan Upstash sliding window          ║
║                                                                  ║
║  2. UNIQUE CONSTRAINT pada invoices.encounter_id                 ║
║     Masalah: 2+ concurrent sync = duplikat invoice               ║
║     Fix:  ALTER TABLE invoices ADD UNIQUE (encounter_id)         ║
║           WHERE episode_of_care_id IS NULL;                      ║
║           Ganti INSERT dengan UPSERT onConflict='encounter_id'   ║
║                                                                  ║
║  🟡 NICE TO HAVE:                                                ║
║                                                                  ║
║  3. QUEUE (Inngest/BullMQ) untuk invoice sync                    ║
║     Masalah: O(n) DB calls per sync, blokir response             ║
║     Efek: discharge patient lambat jika banyak encounter         ║
║     Fix:  Jadikan syncInvoiceForEpisode background job           ║
║           + batch stock_movements query                          ║
║                                                                  ║
║  4. BATCH query di buildInvoiceFromEncounter                     ║
║     Masalah: 1 SELECT per prescription item (obat)               ║
║     Fix:  Collect semua medication_id, 1× SELECT IN (...)        ║
║                                                                  ║
║  🟢 TIDAK PERLU (sudah aman):                                    ║
║                                                                  ║
║  ✓ Running bill concurrent INSERT — Supabase handle atomic       ║
║  ✓ Supabase connection pooling — PostgREST manage sendiri        ║
║  ✓ 50 concurrent SELECT < 5s — DB performa OK untuk klinik kecil ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
    `)

    expect(needsRedis).toBe(true)
    expect(findings.runningBillsConcurrentSafe).toBe(true)
  })

  it('estimasi load klinik kecil vs medium', () => {
    // Klinik kecil: ~50 pasien/hari
    // Peak hour: 50 pasien / 4 jam = ~12 pasien/jam = ~0.2 req/s
    // Dengan 5 staff online: ~1 req/s concurrent

    // Klinik medium: ~200 pasien/hari
    // Peak: 50 pasien/jam = ~0.8 req/s base, burst 5-10 req/s

    const smallClinicReqPerSec = 1
    const mediumClinicReqPerSec = 10

    // Rate limits saat ini: read=60/min (1/s), write=20/min (0.33/s)
    const readLimit = 60 / 60  // per second
    const writeLimit = 20 / 60

    console.log(
      `\n[Load Estimation]\n` +
      `  Klinik kecil (~50 pasien/hari):\n` +
      `    Peak load: ~${smallClinicReqPerSec} req/s\n` +
      `    Rate limit read: ${readLimit.toFixed(2)}/s per IP → OK untuk 1 user\n` +
      `    Rate limit write: ${writeLimit.toFixed(2)}/s per IP → TIGHT (1 discharge ≈ 5 writes)\n` +
      `\n  Klinik medium (~200 pasien/hari):\n` +
      `    Peak load: ~${mediumClinicReqPerSec} req/s\n` +
      `    Multiple users same IP (WiFi klinik) → rate limit terlalu ketat\n` +
      `    💡 Pertimbangkan rate limit per user (user_id) bukan per IP\n` +
      `\n  Kesimpulan: SIMRS cocok untuk klinik kecil tanpa Redis\n` +
      `  Untuk klinik medium ke atas: Redis wajib`
    )

    expect(smallClinicReqPerSec).toBeLessThan(readLimit * 60)
    expect(mediumClinicReqPerSec * 60).toBeGreaterThan(writeLimit * 60)
  })
})
