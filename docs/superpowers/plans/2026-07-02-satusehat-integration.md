# SATUSEHAT Sandbox Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the mock Satu Sehat integration with a real FHIR R4 sync to the SATUSEHAT sandbox (staging), driven by an outbox queue + background worker, plus a synchronous NIK/IHS patient verification at check-in and a mock BPJS VClaim eligibility check.

**Architecture:** API routes never call SATUSEHAT inline for clinical data — they insert a job row into `ss_sync_queue` and kick `/api/ss/worker` (fire-and-forget). The worker drains due jobs in dependency order: it loads the local row, constructs the FHIR payload via a pure builder function, POSTs to SATUSEHAT, writes the returned resource ID + `ss_sync_status` back to the local table, and appends to `ss_sync_logs`. Failed jobs retry with exponential backoff; a Vercel cron sweeps the queue as a safety net. Two synchronous exceptions: patient NIK/IHS verification and BPJS eligibility check run in-request at check-in time.

**Tech Stack:** Next.js 15 App Router route handlers, Supabase (service-role client for worker), Upstash Redis (OAuth token cache), Vercel Cron, vitest.

## Global Constraints

- SATUSEHAT staging base URL: `https://api-satusehat-stg.dto.kemkes.go.id`; auth path `/oauth2/v1/accesstoken?grant_type=client_credentials`; FHIR path `/fhir-r4/v1`.
- **⚠️ `.env` does NOT yet contain `SATUSEHAT_ORG_ID`, `SATUSEHAT_CLIENT_ID`, `SATUSEHAT_CLIENT_SECRET`** (verified 2026-07-02). Task 1 adds placeholders; the user must fill real sandbox values before Phase 1 verification. Also required: `CRON_SECRET` (new), `BASE_URL` (already present).
- Every failed OAuth attempt is penalized 1 minute by SATUSEHAT — never retry auth in a tight loop; cache tokens in Redis (`expires_in` ≈ 3599 s).
- All new server code lives in `lib/satusehat/` (and `lib/bpjs/`). No raw `fetch()` outside `lib/` per repo convention (client-side); server-side SATUSEHAT calls only inside `lib/satusehat/client.ts` and `lib/satusehat/auth.ts`.
- API route conventions (guards, rate-limit, `apiResponse`) apply to all new routes except `/api/ss/worker`, which authenticates via `Authorization: Bearer ${CRON_SECRET}` instead (Vercel cron sends this header automatically when `CRON_SECRET` env is set).
- Builders are **pure functions** (no I/O) so they unit-test without network/DB. Worker handlers receive a `FhirClient` interface so tests stub the SATUSEHAT boundary only — Supabase is always real in tests, per repo convention.
- `pnpm build` ignores TS errors (next.config.mjs) — do not rely on build to catch type mistakes; run tests.
- Scope decisions (confirmed against SATUSEHAT resource catalogue):
  - `invoices` → SATUSEHAT ingests no Invoice resource. Remove `syncInvoice`; set `ss_sync_status = 'not_required'` on invoices.
  - `episodes_of_care` → no EpisodeOfCare endpoint in SATUSEHAT; inpatient stays sync as `Encounter` with `class = IMP`. Mark episode rows `not_required`.
  - `vital_signs.ss_observation_id` is **jsonb**: store a map `{ "<loinc>": "<ss observation id>" }` (one FHIR Observation per vital measurement).
  - BPJS VClaim: mock client behind an interface; real credentials come later.

## Working Phases

| Phase | Deliverable | Depends on |
|---|---|---|
| 1 | SATUSEHAT config + OAuth + FHIR client, live smoke test | — |
| 2 | `ss_sync_queue` migration, enqueue helper, worker route, Vercel cron | 1 |
| 3 | Practitioner IHS lookup (master data prerequisite) | 1 |
| 4 | Patient IHS service + `/api/patients/verify` (synchronous check-in path) | 1, 3 |
| 5 | Outpatient clinical sync: Encounter, Observation, Condition, AllergyIntolerance, ClinicalImpression | 2, 4 |
| 6 | Pharmacy sync: Medication, MedicationRequest, MedicationDispense | 5 |
| 7 | Inpatient: IMP encounters + Composition (resume medis) | 5 |
| 8 | Procedure + Lab (ServiceRequest, DiagnosticReport) | 5 |
| 9 | BPJS mock VClaim eligibility at every check-in | — |
| 10 | Remove mock `satu-sehat.ts`, mark invoices/episodes `not_required` | 5–8 |

## File Structure

```
lib/satusehat/
  config.ts               — env access, base URLs, FHIR system constants
  auth.ts                 — OAuth2 token with Upstash Redis + in-memory cache
  client.ts               — FhirClient interface + real impl (fhirGet/Post/Put)
  queue.ts                — enqueueSync() + kickWorker()
  worker.ts               — drainQueue(): claim jobs, dispatch, retry/backoff
  patient-service.ts      — ensurePatientIhs(): local → SS lookup → SS create
  practitioner-service.ts — ensurePractitionerIhs(): SS lookup by NIK
  handlers/
    index.ts              — resource_type → handler registry
    encounter.ts, observation.ts, condition.ts, allergy.ts,
    clinical-note.ts, medication.ts, procedure.ts, composition.ts, lab.ts
  builders/
    common.ts             — refs, identifiers, shared types
    encounter.ts, observation.ts, condition.ts, allergy.ts,
    clinical-note.ts, medication.ts, procedure.ts, composition.ts, lab.ts
lib/bpjs/
  vclaim.ts               — VClaimClient interface + MockVClaimClient
app/api/ss/worker/route.ts        — cron/kick-protected queue drain
app/api/patients/verify/route.ts  — NIK verification at check-in
app/api/bpjs/eligibility/route.ts — BPJS check at check-in
scripts/ss-smoke.ts               — manual live sandbox smoke test
vercel.json                       — cron definition
__tests__/satusehat-builders.test.ts
__tests__/satusehat-queue.test.ts
migrations (Supabase MCP apply_migration):
  ss_sync_queue table, prescription_items ss columns
```

---

## Phase 1 — Core client infrastructure

### Task 1: Config module + env placeholders

**Files:**
- Create: `lib/satusehat/config.ts`
- Modify: `.env` (append)
- Test: `__tests__/satusehat-builders.test.ts` (created here, grows in later tasks)

**Interfaces:**
- Produces: `ssConfig(): { orgId: string; clientId: string; clientSecret: string }`, `SS_AUTH_URL: string`, `SS_FHIR_URL: string`, `FHIR: Record<string, string>` constants object, `encounterIdentifierSystem(orgId: string): string` (and sibling identifier helpers).

- [ ] **Step 1: Append env placeholders**

Append to `simrs/.env` (user fills real values):

```
SATUSEHAT_ORG_ID=
SATUSEHAT_CLIENT_ID=
SATUSEHAT_CLIENT_SECRET=
CRON_SECRET=
```

Generate a value for CRON_SECRET immediately: `openssl rand -hex 32`.

- [ ] **Step 2: Write the failing test**

```ts
// __tests__/satusehat-builders.test.ts
import { describe, it, expect } from 'vitest'
import { SS_AUTH_URL, SS_FHIR_URL, FHIR, encounterIdentifierSystem } from '@/lib/satusehat/config'

describe('satusehat config', () => {
  it('builds staging URLs', () => {
    expect(SS_AUTH_URL).toBe('https://api-satusehat-stg.dto.kemkes.go.id/oauth2/v1/accesstoken?grant_type=client_credentials')
    expect(SS_FHIR_URL).toBe('https://api-satusehat-stg.dto.kemkes.go.id/fhir-r4/v1')
  })
  it('exposes FHIR code systems', () => {
    expect(FHIR.nik).toBe('https://fhir.kemkes.go.id/id/nik')
    expect(FHIR.icd10).toBe('http://hl7.org/fhir/sid/icd-10')
    expect(encounterIdentifierSystem('100012345')).toBe('http://sys-ids.kemkes.go.id/encounter/100012345')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- __tests__/satusehat-builders.test.ts`
Expected: FAIL — cannot resolve `@/lib/satusehat/config`

- [ ] **Step 4: Implement**

```ts
// lib/satusehat/config.ts
const BASE = process.env.SATUSEHAT_BASE_URL ?? 'https://api-satusehat-stg.dto.kemkes.go.id'

export const SS_AUTH_URL = `${BASE}/oauth2/v1/accesstoken?grant_type=client_credentials`
export const SS_FHIR_URL = `${BASE}/fhir-r4/v1`

export function ssConfig() {
  const orgId = process.env.SATUSEHAT_ORG_ID
  const clientId = process.env.SATUSEHAT_CLIENT_ID
  const clientSecret = process.env.SATUSEHAT_CLIENT_SECRET
  if (!orgId || !clientId || !clientSecret) {
    throw new Error('Missing env: SATUSEHAT_ORG_ID / SATUSEHAT_CLIENT_ID / SATUSEHAT_CLIENT_SECRET')
  }
  return { orgId, clientId, clientSecret }
}

export const FHIR = {
  nik: 'https://fhir.kemkes.go.id/id/nik',
  ihs: 'https://fhir.kemkes.go.id/id/ihs-number',
  icd10: 'http://hl7.org/fhir/sid/icd-10',
  icd9cm: 'http://hl7.org/fhir/sid/icd-9-cm',
  loinc: 'http://loinc.org',
  kfa: 'http://sys-ids.kemkes.go.id/kfa',
  ucum: 'http://unitsofmeasure.org',
  actCode: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  participationType: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
  obsCategory: 'http://terminology.hl7.org/CodeSystem/observation-category',
  conditionClinical: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  conditionCategory: 'http://terminology.hl7.org/CodeSystem/condition-category',
  allergyClinical: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
  allergyVerification: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
} as const

export const encounterIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/encounter/${orgId}`
export const prescriptionIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/prescription/${orgId}`
export const prescriptionItemIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/prescription-item/${orgId}`
export const medicationIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/medication/${orgId}`
export const compositionIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/composition/${orgId}`
export const serviceRequestIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/servicerequest/${orgId}`
export const diagnosticReportIdentifierSystem = (orgId: string) => `http://sys-ids.kemkes.go.id/diagnostic/${orgId}`
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- __tests__/satusehat-builders.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/satusehat/config.ts __tests__/satusehat-builders.test.ts
git commit -m "feat(satusehat): config module with staging URLs and FHIR systems"
```

---

### Task 2: OAuth token client with Redis cache

**Files:**
- Create: `lib/satusehat/auth.ts`

**Interfaces:**
- Consumes: `ssConfig()`, `SS_AUTH_URL` from Task 1; `@upstash/redis` (already a dependency — used by `lib/api/rate-limit.ts`).
- Produces: `getAccessToken(): Promise<string>` — cached; `invalidateToken(): Promise<void>` — called by client on 401.

No unit test (pure I/O); verified by the live smoke test in Task 3. TDD exemption: this module is a thin cache around one HTTP call — the smoke test is the real verification.

- [ ] **Step 1: Implement**

```ts
// lib/satusehat/auth.ts
import { Redis } from '@upstash/redis'
import { SS_AUTH_URL, ssConfig } from './config'

const TOKEN_KEY = 'satusehat:access_token'
let mem: { token: string; expiresAt: number } | null = null

function redis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (mem && mem.expiresAt > now) return mem.token

  const r = redis()
  const cached = await r.get<string>(TOKEN_KEY)
  if (cached) {
    mem = { token: cached, expiresAt: now + 30_000 } // trust redis TTL, re-check in 30s
    return cached
  }

  const { clientId, clientSecret } = ssConfig()
  const res = await fetch(SS_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
  })
  if (!res.ok) {
    throw new Error(`SATUSEHAT auth failed ${res.status}: ${await res.text()}`)
  }
  const json = await res.json()
  const token = json.access_token as string
  // expires_in ≈ 3599s; refresh 2 min early. Failed auths are rate-penalized, so cache hard.
  const ttl = Math.max(Number(json.expires_in ?? 3599) - 120, 60)
  await r.set(TOKEN_KEY, token, { ex: ttl })
  mem = { token, expiresAt: now + ttl * 1000 }
  return token
}

export async function invalidateToken(): Promise<void> {
  mem = null
  await redis().del(TOKEN_KEY)
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/satusehat/auth.ts
git commit -m "feat(satusehat): OAuth2 token client with Redis + memory cache"
```

---

### Task 3: FHIR HTTP client + live smoke test

**Files:**
- Create: `lib/satusehat/client.ts`
- Create: `scripts/ss-smoke.ts`

**Interfaces:**
- Consumes: `getAccessToken`, `invalidateToken` (Task 2), `SS_FHIR_URL` (Task 1).
- Produces:

```ts
export interface FhirResult { ok: boolean; status: number; body: any }
export interface FhirClient {
  get(path: string): Promise<FhirResult>
  post(path: string, payload: unknown): Promise<FhirResult>
  put(path: string, payload: unknown): Promise<FhirResult>
}
export const realFhirClient: FhirClient
```

All worker handlers depend on the `FhirClient` **interface**, never on `realFhirClient` directly — this is the test seam.

- [ ] **Step 1: Implement client**

```ts
// lib/satusehat/client.ts
import { getAccessToken, invalidateToken } from './auth'
import { SS_FHIR_URL } from './config'

export interface FhirResult { ok: boolean; status: number; body: any }

export interface FhirClient {
  get(path: string): Promise<FhirResult>
  post(path: string, payload: unknown): Promise<FhirResult>
  put(path: string, payload: unknown): Promise<FhirResult>
}

async function request(method: 'GET' | 'POST' | 'PUT', path: string, payload?: unknown, retried = false): Promise<FhirResult> {
  const token = await getAccessToken()
  const res = await fetch(`${SS_FHIR_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  })
  // one retry on stale token
  if (res.status === 401 && !retried) {
    await invalidateToken()
    return request(method, path, payload, true)
  }
  let body: any = null
  try { body = await res.json() } catch { /* non-JSON error body */ }
  return { ok: res.ok, status: res.status, body }
}

export const realFhirClient: FhirClient = {
  get: (path) => request('GET', path),
  post: (path, payload) => request('POST', path, payload),
  put: (path, payload) => request('PUT', path, payload),
}
```

- [ ] **Step 2: Write smoke script**

```ts
// scripts/ss-smoke.ts — run manually: npx tsx --env-file=.env scripts/ss-smoke.ts
import { realFhirClient } from '../lib/satusehat/client'
import { ssConfig, FHIR } from '../lib/satusehat/config'

async function main() {
  const { orgId } = ssConfig()
  console.log('1. Organization lookup…')
  const org = await realFhirClient.get(`/Organization/${orgId}`)
  console.log(`   ${org.status} ${org.body?.resourceType ?? ''} ${org.body?.name ?? JSON.stringify(org.body)}`)

  console.log('2. Patient search by test NIK (sandbox dummy)…')
  // Official sandbox test NIK published in SATUSEHAT docs
  const pat = await realFhirClient.get(`/Patient?identifier=${encodeURIComponent(`${FHIR.nik}|9271060312000001`)}`)
  console.log(`   ${pat.status} total=${pat.body?.total}`)
  if (!org.ok || !pat.ok) process.exit(1)
  console.log('SMOKE OK')
}
main()
```

- [ ] **Step 3: Run smoke test (requires real sandbox creds in .env)**

Run: `npx tsx --env-file=.env scripts/ss-smoke.ts`
Expected: `1. … 200 Organization <your org name>`, `2. … 200 total=1`, `SMOKE OK`.
If creds are still empty this throws `Missing env: SATUSEHAT_ORG_ID…` — **stop and ask the user for the sandbox credentials** before continuing to Phase 5+ verification (Phases 2–4 code can proceed).

- [ ] **Step 4: Commit**

```bash
git add lib/satusehat/client.ts scripts/ss-smoke.ts
git commit -m "feat(satusehat): FHIR client with 401 retry + live smoke script"
```

---

## Phase 2 — Outbox queue + worker

### Task 4: `ss_sync_queue` migration + prescription_items ss columns

**Files:**
- Migration via Supabase MCP `apply_migration` (name: `ss_sync_queue_and_rx_items`)
- Test: `__tests__/satusehat-queue.test.ts`

**Interfaces:**
- Produces table `ss_sync_queue` with columns: `id uuid pk`, `resource_type text`, `local_id uuid`, `action text`, `status ss_job_status`, `attempts int`, `max_attempts int`, `next_attempt_at timestamptz`, `last_error text`, `created_at`, `updated_at`. Unique on `(resource_type, local_id, action)`.
- Produces `prescription_items.ss_medication_request_id text` and `prescription_items.ss_sync_status satu_sehat_sync_status` (MedicationRequest is per-item in FHIR; the header column on `prescriptions` stays as an aggregate marker).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/satusehat-queue.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

describe('ss_sync_queue table', () => {
  it('inserts and upserts a job on the unique key', async () => {
    const localId = crypto.randomUUID()
    const { error: e1 } = await supabase.from('ss_sync_queue').insert({
      resource_type: 'Encounter', local_id: localId, action: 'POST',
    })
    expect(e1).toBeNull()
    // duplicate enqueue must not error (upsert path used by enqueueSync)
    const { error: e2 } = await supabase.from('ss_sync_queue').upsert(
      { resource_type: 'Encounter', local_id: localId, action: 'POST', status: 'pending' },
      { onConflict: 'resource_type,local_id,action' },
    )
    expect(e2).toBeNull()
    const { data } = await supabase.from('ss_sync_queue')
      .select('*').eq('local_id', localId)
    expect(data).toHaveLength(1)
    expect(data![0].status).toBe('pending')
    expect(data![0].attempts).toBe(0)
    await supabase.from('ss_sync_queue').delete().eq('local_id', localId)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- __tests__/satusehat-queue.test.ts`
Expected: FAIL — relation "ss_sync_queue" does not exist

- [ ] **Step 3: Apply migration** (Supabase MCP `apply_migration`, name `ss_sync_queue_and_rx_items`)

```sql
CREATE TYPE ss_job_status AS ENUM ('pending', 'processing', 'success', 'failed', 'dead');

CREATE TABLE public.ss_sync_queue (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  resource_type text NOT NULL,
  local_id uuid NOT NULL,
  action text NOT NULL DEFAULT 'POST',
  status ss_job_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_type, local_id, action)
);

CREATE INDEX idx_ss_sync_queue_due ON public.ss_sync_queue (next_attempt_at)
  WHERE status IN ('pending', 'failed');

-- Service-role only: RLS on, no policies.
ALTER TABLE public.ss_sync_queue ENABLE ROW LEVEL SECURITY;

-- Atomic claim used by the worker (skips rows locked by a concurrent worker run)
CREATE OR REPLACE FUNCTION public.claim_ss_sync_jobs(p_limit integer DEFAULT 20)
RETURNS SETOF public.ss_sync_queue
LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE public.ss_sync_queue q
  SET status = 'processing', updated_at = now()
  WHERE q.id IN (
    SELECT id FROM public.ss_sync_queue
    WHERE status IN ('pending', 'failed') AND next_attempt_at <= now()
    ORDER BY created_at
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING q.*;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_ss_sync_jobs(integer) FROM anon, authenticated;

-- MedicationRequest is per prescription item in FHIR
ALTER TABLE public.prescription_items
  ADD COLUMN ss_medication_request_id text,
  ADD COLUMN ss_sync_status satu_sehat_sync_status NOT NULL DEFAULT 'pending';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- __tests__/satusehat-queue.test.ts`
Expected: PASS

- [ ] **Step 5: Commit test file**

```bash
git add __tests__/satusehat-queue.test.ts
git commit -m "feat(satusehat): ss_sync_queue outbox table + claim RPC (migration applied)"
```

---

### Task 5: Enqueue helper + worker core

**Files:**
- Create: `lib/satusehat/queue.ts`
- Create: `lib/satusehat/worker.ts`
- Create: `lib/satusehat/handlers/index.ts`
- Test: extend `__tests__/satusehat-queue.test.ts`

**Interfaces:**
- Consumes: `FhirClient` (Task 3), `claim_ss_sync_jobs` RPC (Task 4).
- Produces:

```ts
// queue.ts
export type SsResourceType =
  | 'Patient' | 'Encounter' | 'Observation' | 'Condition' | 'AllergyIntolerance'
  | 'ClinicalImpression' | 'Medication' | 'MedicationRequest' | 'MedicationDispense'
  | 'Procedure' | 'Composition' | 'ServiceRequest' | 'DiagnosticReport'
export async function enqueueSync(supabase: SupabaseClient, resourceType: SsResourceType, localId: string, action?: 'POST' | 'PUT'): Promise<void>
export function kickWorker(): void

// worker.ts
export class DeferSync extends Error {}          // dependency not ready — reschedule without counting as failure
export interface SyncJob { id: string; resource_type: string; local_id: string; action: string; attempts: number; max_attempts: number }
export type SyncHandler = (supabase: SupabaseClient, fhir: FhirClient, job: SyncJob) => Promise<void>
export async function drainQueue(supabase: SupabaseClient, fhir: FhirClient, limit?: number): Promise<{ processed: number; succeeded: number; deferred: number; failed: number }>

// handlers/index.ts
export const handlers: Record<string, SyncHandler>
```

- [ ] **Step 1: Write the failing test**

Append to `__tests__/satusehat-queue.test.ts`:

```ts
import { enqueueSync } from '@/lib/satusehat/queue'
import { drainQueue, DeferSync, type SyncHandler } from '@/lib/satusehat/worker'
import { handlers } from '@/lib/satusehat/handlers'
import type { FhirClient } from '@/lib/satusehat/client'

const stubFhir: FhirClient = {
  get: async () => ({ ok: true, status: 200, body: {} }),
  post: async () => ({ ok: true, status: 201, body: { id: 'ss-test-id' } }),
  put: async () => ({ ok: true, status: 200, body: { id: 'ss-test-id' } }),
}

describe('worker drain', () => {
  it('runs handler and marks success', async () => {
    const localId = crypto.randomUUID()
    let handled = 0
    handlers['__Test'] = async () => { handled++ }
    await enqueueSync(supabase as any, '__Test' as any, localId)
    const result = await drainQueue(supabase as any, stubFhir)
    expect(handled).toBe(1)
    expect(result.succeeded).toBeGreaterThanOrEqual(1)
    const { data } = await supabase.from('ss_sync_queue').select('status').eq('local_id', localId).single()
    expect(data!.status).toBe('success')
    await supabase.from('ss_sync_queue').delete().eq('local_id', localId)
    delete handlers['__Test']
  })

  it('defers on DeferSync without burning an attempt', async () => {
    const localId = crypto.randomUUID()
    handlers['__Defer'] = async () => { throw new DeferSync('dep not ready') }
    await enqueueSync(supabase as any, '__Defer' as any, localId)
    await drainQueue(supabase as any, stubFhir)
    const { data } = await supabase.from('ss_sync_queue').select('status, attempts').eq('local_id', localId).single()
    expect(data!.status).toBe('pending')
    expect(data!.attempts).toBe(0)
    await supabase.from('ss_sync_queue').delete().eq('local_id', localId)
    delete handlers['__Defer']
  })

  it('backs off and eventually marks dead', async () => {
    const localId = crypto.randomUUID()
    handlers['__Fail'] = async () => { throw new Error('boom') }
    await enqueueSync(supabase as any, '__Fail' as any, localId)
    // force max_attempts=1 so a single drain kills it
    await supabase.from('ss_sync_queue').update({ max_attempts: 1 }).eq('local_id', localId)
    await drainQueue(supabase as any, stubFhir)
    const { data } = await supabase.from('ss_sync_queue').select('status, last_error').eq('local_id', localId).single()
    expect(data!.status).toBe('dead')
    expect(data!.last_error).toContain('boom')
    await supabase.from('ss_sync_queue').delete().eq('local_id', localId)
    delete handlers['__Fail']
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- __tests__/satusehat-queue.test.ts`
Expected: FAIL — cannot resolve `@/lib/satusehat/queue`

- [ ] **Step 3: Implement queue.ts**

```ts
// lib/satusehat/queue.ts
import { SupabaseClient } from '@supabase/supabase-js'

export type SsResourceType =
  | 'Patient' | 'Encounter' | 'Observation' | 'Condition' | 'AllergyIntolerance'
  | 'ClinicalImpression' | 'Medication' | 'MedicationRequest' | 'MedicationDispense'
  | 'Procedure' | 'Composition' | 'ServiceRequest' | 'DiagnosticReport'

/**
 * Enqueue an outbox job. Idempotent: re-enqueueing an existing
 * (resource_type, local_id, action) resets it to pending for immediate retry.
 * Never throws — a sync enqueue failure must not block the clinical workflow.
 */
export async function enqueueSync(
  supabase: SupabaseClient,
  resourceType: SsResourceType,
  localId: string,
  action: 'POST' | 'PUT' = 'POST',
): Promise<void> {
  try {
    await supabase.from('ss_sync_queue').upsert(
      {
        resource_type: resourceType,
        local_id: localId,
        action,
        status: 'pending',
        next_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'resource_type,local_id,action' },
    )
    kickWorker()
  } catch {
    // swallow — cron sweep will still pick nothing up if the insert failed,
    // but the clinical write must never fail because of sync plumbing
  }
}

/** Fire-and-forget poke so jobs run near-realtime instead of waiting for cron. */
export function kickWorker(): void {
  const base = process.env.BASE_URL
  const secret = process.env.CRON_SECRET
  if (!base || !secret) return
  fetch(`${base}/api/ss/worker`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => {})
}
```

- [ ] **Step 4: Implement worker.ts and handlers/index.ts**

```ts
// lib/satusehat/worker.ts
import { SupabaseClient } from '@supabase/supabase-js'
import type { FhirClient } from './client'
import { handlers } from './handlers'

/** Throw from a handler when a dependency (e.g. patient IHS) isn't synced yet. */
export class DeferSync extends Error {}

export interface SyncJob {
  id: string
  resource_type: string
  local_id: string
  action: string
  attempts: number
  max_attempts: number
}

export type SyncHandler = (supabase: SupabaseClient, fhir: FhirClient, job: SyncJob) => Promise<void>

const DEFER_DELAY_MS = 60_000

function backoffMs(attempts: number): number {
  return Math.min(2 ** attempts, 60) * 60_000 // 2,4,8,…60 minutes
}

export async function drainQueue(supabase: SupabaseClient, fhir: FhirClient, limit = 20) {
  const { data: jobs, error } = await supabase.rpc('claim_ss_sync_jobs', { p_limit: limit })
  if (error) throw new Error(`claim_ss_sync_jobs failed: ${error.message}`)

  const stats = { processed: 0, succeeded: 0, deferred: 0, failed: 0 }

  for (const job of (jobs ?? []) as SyncJob[]) {
    stats.processed++
    const handler = handlers[job.resource_type]
    try {
      if (!handler) throw new Error(`no handler for resource_type ${job.resource_type}`)
      await handler(supabase, fhir, job)
      await supabase.from('ss_sync_queue')
        .update({ status: 'success', updated_at: new Date().toISOString() })
        .eq('id', job.id)
      stats.succeeded++
    } catch (e: any) {
      if (e instanceof DeferSync) {
        // dependency not ready — retry soon, don't count as failure
        await supabase.from('ss_sync_queue').update({
          status: 'pending',
          next_attempt_at: new Date(Date.now() + DEFER_DELAY_MS).toISOString(),
          last_error: `deferred: ${e.message}`,
          updated_at: new Date().toISOString(),
        }).eq('id', job.id)
        stats.deferred++
        continue
      }
      const attempts = job.attempts + 1
      const dead = attempts >= job.max_attempts
      await supabase.from('ss_sync_queue').update({
        status: dead ? 'dead' : 'failed',
        attempts,
        next_attempt_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
        last_error: String(e?.message ?? e).slice(0, 2000),
        updated_at: new Date().toISOString(),
      }).eq('id', job.id)
      stats.failed++
    }
  }
  return stats
}
```

```ts
// lib/satusehat/handlers/index.ts
import type { SyncHandler } from '../worker'

// Populated by later tasks (encounter, observation, …). Mutable so tests can
// register throwaway handlers.
export const handlers: Record<string, SyncHandler> = {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test -- __tests__/satusehat-queue.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/satusehat/queue.ts lib/satusehat/worker.ts lib/satusehat/handlers/index.ts __tests__/satusehat-queue.test.ts
git commit -m "feat(satusehat): outbox enqueue + worker drain with defer/backoff/dead"
```

---

### Task 6: Worker route + Vercel cron

**Files:**
- Create: `app/api/ss/worker/route.ts`
- Create: `vercel.json` (repo root `simrs/`)

**Interfaces:**
- Consumes: `drainQueue` (Task 5), `realFhirClient` (Task 3), `createAdminClient` from `lib/supabase/admin.ts` (existing).
- Produces: `GET|POST /api/ss/worker` → `{ success: true, data: { processed, succeeded, deferred, failed } }`.

- [ ] **Step 1: Implement route**

```ts
// app/api/ss/worker/route.ts
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { realFhirClient } from '@/lib/satusehat/client'
import { drainQueue } from '@/lib/satusehat/worker'
import { apiResponse } from '@/lib/api/response'

export const maxDuration = 60 // Vercel function limit for the drain batch

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return req.headers.get('authorization') === `Bearer ${secret}`
}

async function run(req: NextRequest) {
  if (!authorized(req)) return apiResponse.unauthorized()
  const supabase = createAdminClient()
  try {
    const stats = await drainQueue(supabase, realFhirClient)
    return apiResponse.ok(stats)
  } catch (e: any) {
    console.error('ss worker drain error:', e)
    return apiResponse.serverError(e?.message)
  }
}

export async function GET(req: NextRequest) { return run(req) }   // Vercel cron uses GET
export async function POST(req: NextRequest) { return run(req) }  // kickWorker uses POST
```

Check `lib/api/response.ts` exports `unauthorized()`; if the helper has a different name (e.g. `apiResponse.forbidden`), match the existing one.

- [ ] **Step 2: Add vercel.json**

```json
{
  "crons": [
    { "path": "/api/ss/worker", "schedule": "*/10 * * * *" }
  ]
}
```

Note: on the Vercel **Hobby** plan, crons fire at most once per day regardless of schedule. The `kickWorker()` poke after every enqueue is the primary near-realtime path; the cron is the retry sweeper. On Hobby, failed jobs may wait up to 24 h for retry — acceptable for the sandbox; upgrade or use Supabase `pg_cron` + `pg_net` when moving to production/DigitalOcean.

Also add `CRON_SECRET` to Vercel project env (Production + Preview) when deploying.

- [ ] **Step 3: Verify manually**

Run: `pnpm dev` then in another shell:
```bash
curl -s -X POST http://localhost:3000/api/ss/worker -H "Authorization: Bearer $(grep CRON_SECRET .env | cut -d= -f2)"
```
Expected: `{"success":true,"data":{"processed":0,"succeeded":0,"deferred":0,"failed":0}}`
And without the header: `401`.

- [ ] **Step 4: Commit**

```bash
git add app/api/ss/worker/route.ts vercel.json
git commit -m "feat(satusehat): worker route with CRON_SECRET auth + vercel cron"
```

---

## Phase 3 — Master data prerequisite

### Task 7: Practitioner IHS lookup service

Practitioners must have `ss_ihs_number` before any Encounter can sync (participant reference). SATUSEHAT exposes `GET /Practitioner?identifier=nik|<nik>`.

**Files:**
- Create: `lib/satusehat/practitioner-service.ts`
- Create: `scripts/ss-backfill-practitioners.ts`

**Interfaces:**
- Consumes: `FhirClient`, `FHIR` constants.
- Produces: `ensurePractitionerIhs(supabase, fhir, practitionerId): Promise<string>` — returns IHS number; throws `DeferSync` never (throws plain Error if practitioner has no NIK or SATUSEHAT has no record — that's an operator-fixable data problem).

- [ ] **Step 1: Implement service**

```ts
// lib/satusehat/practitioner-service.ts
import { SupabaseClient } from '@supabase/supabase-js'
import type { FhirClient } from './client'
import { FHIR } from './config'

/**
 * Returns the practitioner's IHS number, looking it up on SATUSEHAT by NIK
 * and persisting it on first resolution.
 */
export async function ensurePractitionerIhs(
  supabase: SupabaseClient,
  fhir: FhirClient,
  practitionerId: string,
): Promise<string> {
  const { data: prac, error } = await supabase
    .from('practitioners')
    .select('id, nik, full_name, ss_ihs_number')
    .eq('id', practitionerId)
    .single()
  if (error || !prac) throw new Error(`practitioner ${practitionerId} not found: ${error?.message}`)
  if (prac.ss_ihs_number) return prac.ss_ihs_number
  if (!prac.nik) throw new Error(`practitioner ${prac.full_name} has no NIK — cannot resolve IHS`)

  const res = await fhir.get(`/Practitioner?identifier=${encodeURIComponent(`${FHIR.nik}|${prac.nik}`)}`)
  if (!res.ok) throw new Error(`Practitioner lookup failed ${res.status}: ${JSON.stringify(res.body)}`)
  const ihs = res.body?.entry?.[0]?.resource?.id
  if (!ihs) throw new Error(`SATUSEHAT has no Practitioner for NIK of ${prac.full_name}`)

  await supabase.from('practitioners')
    .update({ ss_practitioner_id: ihs, ss_ihs_number: ihs })
    .eq('id', practitionerId)
  return ihs
}
```

- [ ] **Step 2: Backfill script**

```ts
// scripts/ss-backfill-practitioners.ts — run: npx tsx --env-file=.env scripts/ss-backfill-practitioners.ts
import { createClient } from '@supabase/supabase-js'
import { realFhirClient } from '../lib/satusehat/client'
import { ensurePractitionerIhs } from '../lib/satusehat/practitioner-service'

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: pracs } = await supabase
    .from('practitioners').select('id, full_name').is('ss_ihs_number', null).eq('is_active', true)
  for (const p of pracs ?? []) {
    try {
      const ihs = await ensurePractitionerIhs(supabase, realFhirClient, p.id)
      console.log(`OK   ${p.full_name} → ${ihs}`)
    } catch (e: any) {
      console.log(`SKIP ${p.full_name}: ${e.message}`)
    }
  }
}
main()
```

- [ ] **Step 3: Run backfill (needs creds; sandbox test-NIK practitioners only)**

Run: `npx tsx --env-file=.env scripts/ss-backfill-practitioners.ts`
Expected: one `OK`/`SKIP` line per active practitioner. In sandbox, only practitioners whose NIK matches the published SATUSEHAT dummy NIKs resolve — set the dev practitioner's `nik` to a sandbox dummy practitioner NIK (from the SATUSEHAT Postman collection env, e.g. the collection's `practitioner_nik` variable) so at least one resolves.

- [ ] **Step 4: Commit**

```bash
git add lib/satusehat/practitioner-service.ts scripts/ss-backfill-practitioners.ts
git commit -m "feat(satusehat): practitioner IHS lookup by NIK + backfill script"
```

---

## Phase 4 — Patient IHS + check-in verification

### Task 8: Patient service (lookup → create → persist)

**Files:**
- Create: `lib/satusehat/patient-service.ts`
- Create: `lib/satusehat/handlers/patient.ts`
- Modify: `lib/satusehat/handlers/index.ts`
- Test: extend `__tests__/satusehat-builders.test.ts` (builder part only)

**Interfaces:**
- Consumes: `FhirClient`, `FHIR`, `DeferSync`.
- Produces:

```ts
// patient-service.ts
export function buildPatientPayload(p: LocalPatient): object                       // pure
export async function lookupPatientByNik(fhir: FhirClient, nik: string): Promise<{ ihs: string; resource: any } | null>
export async function ensurePatientIhs(supabase: SupabaseClient, fhir: FhirClient, patientId: string): Promise<string>
export interface LocalPatient { id: string; nik: string | null; full_name: string; gender: 'male' | 'female'; date_of_birth: string; address: string | null; city: string | null; postal_code: string | null; phone: string | null }
```

Flow of `ensurePatientIhs` (used by worker handlers AND the verify route):
1. Local row has `ss_ihs_number` → return it.
2. Has NIK → `GET /Patient?identifier=nik|<nik>` → found → persist + return.
3. Not found on SATUSEHAT → `POST /Patient` (creates sandbox patient) → persist returned `data.patient_id` + return.
4. No NIK at all → throw `Error('patient has no NIK')` (job goes to failed/backoff; operator fixes data).

- [ ] **Step 1: Write the failing builder test**

Append to `__tests__/satusehat-builders.test.ts`:

```ts
import { buildPatientPayload } from '@/lib/satusehat/patient-service'

describe('buildPatientPayload', () => {
  const base = {
    id: 'uuid-1', nik: '3174012345678901', full_name: 'Budi Santoso',
    gender: 'male' as const, date_of_birth: '1990-05-17',
    address: 'Jl. Melati 1', city: 'Jakarta', postal_code: '12420', phone: '081234567890',
  }
  it('builds a FHIR Patient with NIK identifier', () => {
    const p: any = buildPatientPayload(base)
    expect(p.resourceType).toBe('Patient')
    expect(p.identifier[0]).toEqual({ use: 'official', system: 'https://fhir.kemkes.go.id/id/nik', value: '3174012345678901' })
    expect(p.name[0].text).toBe('Budi Santoso')
    expect(p.gender).toBe('male')
    expect(p.birthDate).toBe('1990-05-17')
    expect(p.address[0].city).toBe('Jakarta')
    expect(p.telecom[0].value).toBe('081234567890')
  })
  it('omits empty address/telecom', () => {
    const p: any = buildPatientPayload({ ...base, address: null, city: null, postal_code: null, phone: null })
    expect(p.address).toBeUndefined()
    expect(p.telecom).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- __tests__/satusehat-builders.test.ts`
Expected: FAIL — no export `buildPatientPayload`

- [ ] **Step 3: Implement**

```ts
// lib/satusehat/patient-service.ts
import { SupabaseClient } from '@supabase/supabase-js'
import type { FhirClient } from './client'
import { FHIR } from './config'

export interface LocalPatient {
  id: string
  nik: string | null
  full_name: string
  gender: 'male' | 'female'
  date_of_birth: string
  address: string | null
  city: string | null
  postal_code: string | null
  phone: string | null
}

export function buildPatientPayload(p: LocalPatient): object {
  return {
    resourceType: 'Patient',
    meta: { profile: ['https://fhir.kemkes.go.id/r4/StructureDefinition/Patient'] },
    identifier: [{ use: 'official', system: FHIR.nik, value: p.nik }],
    active: true,
    name: [{ use: 'official', text: p.full_name }],
    gender: p.gender,
    birthDate: p.date_of_birth,
    ...(p.address ? {
      address: [{
        use: 'home', line: [p.address],
        ...(p.city ? { city: p.city } : {}),
        ...(p.postal_code ? { postalCode: p.postal_code } : {}),
        country: 'ID',
      }],
    } : {}),
    ...(p.phone ? { telecom: [{ system: 'phone', value: p.phone, use: 'mobile' }] } : {}),
  }
}

export async function lookupPatientByNik(fhir: FhirClient, nik: string) {
  const res = await fhir.get(`/Patient?identifier=${encodeURIComponent(`${FHIR.nik}|${nik}`)}`)
  if (!res.ok) throw new Error(`Patient lookup failed ${res.status}: ${JSON.stringify(res.body)}`)
  const resource = res.body?.entry?.[0]?.resource
  if (!resource?.id) return null
  return { ihs: resource.id as string, resource }
}

export async function ensurePatientIhs(
  supabase: SupabaseClient,
  fhir: FhirClient,
  patientId: string,
): Promise<string> {
  const { data: pat, error } = await supabase
    .from('patients')
    .select('id, nik, full_name, gender, date_of_birth, address, city, postal_code, phone, ss_ihs_number')
    .eq('id', patientId)
    .single()
  if (error || !pat) throw new Error(`patient ${patientId} not found: ${error?.message}`)
  if (pat.ss_ihs_number) return pat.ss_ihs_number
  if (!pat.nik) throw new Error(`patient ${pat.full_name} has no NIK — cannot resolve IHS`)

  const found = await lookupPatientByNik(fhir, pat.nik)
  let ihs: string
  if (found) {
    ihs = found.ihs
  } else {
    const res = await fhir.post('/Patient', buildPatientPayload(pat as LocalPatient))
    if (!res.ok) throw new Error(`Patient create failed ${res.status}: ${JSON.stringify(res.body)}`)
    // POST /Patient returns a non-FHIR envelope: { data: { patient_id: "P0…" } }
    ihs = res.body?.data?.patient_id ?? res.body?.id
    if (!ihs) throw new Error(`Patient create returned no id: ${JSON.stringify(res.body)}`)
  }
  await supabase.from('patients')
    .update({ ss_patient_id: ihs, ss_ihs_number: ihs })
    .eq('id', patientId)
  return ihs
}
```

```ts
// lib/satusehat/handlers/patient.ts
import type { SyncHandler } from '../worker'
import { ensurePatientIhs } from '../patient-service'

export const patientHandler: SyncHandler = async (supabase, fhir, job) => {
  const ihs = await ensurePatientIhs(supabase, fhir, job.local_id)
  await supabase.from('ss_sync_logs').insert({
    resource_type: 'Patient', local_id: job.local_id, ss_resource_id: ihs,
    action: 'POST', request_payload: {}, response_payload: { ihs },
    http_status: 200, status: 'success',
  })
}
```

Register in `lib/satusehat/handlers/index.ts`:

```ts
import type { SyncHandler } from '../worker'
import { patientHandler } from './patient'

export const handlers: Record<string, SyncHandler> = {
  Patient: patientHandler,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- __tests__/satusehat-builders.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/satusehat/patient-service.ts lib/satusehat/handlers/patient.ts lib/satusehat/handlers/index.ts __tests__/satusehat-builders.test.ts
git commit -m "feat(satusehat): patient IHS service — lookup by NIK, create, persist"
```

---

### Task 9: `/api/patients/verify` — synchronous NIK verification at check-in

Frontend flow (registration/check-in): staff enters NIK → this endpoint answers with one of:
- `found_local` — patient exists locally (IHS refreshed if missing)
- `found_ihs` — not local, but SATUSEHAT knows the NIK → **a local patient row is created from FHIR demographics** and returned
- `not_found` — neither side knows the NIK → frontend opens the full registration form; on `POST /api/patients` submit, registration code enqueues a `Patient` sync job (Task 14 wiring)

**Files:**
- Create: `app/api/patients/verify/route.ts`

**Interfaces:**
- Consumes: `lookupPatientByNik`, `ensurePatientIhs`, existing guards `requirePractitioner`, `rateLimit`, `apiResponse`.
- Produces: `POST /api/patients/verify` body `{ nik: string }` → `{ success: true, data: { status: 'found_local' | 'found_ihs' | 'not_found', patient?: <patients row> } }`

- [ ] **Step 1: Implement route**

```ts
// app/api/patients/verify/route.ts
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'
import { realFhirClient } from '@/lib/satusehat/client'
import { lookupPatientByNik, ensurePatientIhs } from '@/lib/satusehat/patient-service'

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, 'patients-verify:post', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { nik } = await req.json()
  if (!nik || !/^\d{16}$/.test(nik)) return apiResponse.badRequest('NIK harus 16 digit')

  const admin = createAdminClient()

  // 1. Local first
  const { data: local } = await admin
    .from('patients').select('*').eq('nik', nik).maybeSingle()
  if (local) {
    if (!local.ss_ihs_number) {
      // refresh IHS in background of this request; non-fatal on failure
      try { await ensurePatientIhs(admin, realFhirClient, local.id) } catch (e) { console.error('IHS refresh failed:', e) }
    }
    const { data: fresh } = await admin.from('patients').select('*').eq('id', local.id).single()
    return apiResponse.ok({ status: 'found_local', patient: fresh })
  }

  // 2. SATUSEHAT by NIK
  let found: Awaited<ReturnType<typeof lookupPatientByNik>> = null
  try {
    found = await lookupPatientByNik(realFhirClient, nik)
  } catch (e) {
    console.error('SATUSEHAT lookup error:', e)
    return apiResponse.ok({ status: 'not_found' }) // degrade gracefully: register manually
  }
  if (!found) return apiResponse.ok({ status: 'not_found' })

  // 3. Create local patient from FHIR demographics
  const r = found.resource
  const { data: created, error } = await admin.from('patients').insert({
    nik,
    full_name: r.name?.[0]?.text ?? r.name?.[0]?.given?.join(' ') ?? 'Tanpa Nama',
    gender: r.gender === 'female' ? 'female' : 'male',
    date_of_birth: r.birthDate ?? null,
    address: r.address?.[0]?.line?.join(', ') ?? null,
    city: r.address?.[0]?.city ?? null,
    phone: r.telecom?.find((t: any) => t.system === 'phone')?.value ?? null,
    medical_record_no: `MR${Date.now().toString().slice(-8)}`,
    ss_patient_id: found.ihs,
    ss_ihs_number: found.ihs,
    is_active: true,
  }).select().single()
  if (error) return apiResponse.serverError(`Gagal membuat pasien: ${error.message}`)

  return apiResponse.ok({ status: 'found_ihs', patient: created })
}
```

Check how `patients.medical_record_no` is generated elsewhere (`app/api/patients/route.ts` POST) and reuse that exact generator instead of the `MR${Date.now()}` fallback if one exists.

- [ ] **Step 2: Verify manually**

Run: `pnpm dev`, log in as nurse, then:
```bash
curl -s -X POST http://localhost:3000/api/patients/verify \
  -H 'Content-Type: application/json' -b '<session cookie>' \
  -d '{"nik":"9271060312000001"}'
```
Expected with sandbox creds: `{"success":true,"data":{"status":"found_ihs","patient":{…}}}` on first call, `found_local` on second call. Without creds: `not_found` (graceful degrade).

- [ ] **Step 3: Add API client function**

Append to `lib/api/client.ts` (follow existing function style in that file):

```ts
export async function verifyPatientNik(nik: string) {
  return request<{ status: 'found_local' | 'found_ihs' | 'not_found'; patient?: Patient }>(
    '/api/patients/verify',
    { method: 'POST', body: JSON.stringify({ nik }) },
  )
}
```

(`request` = whatever the file's internal fetch wrapper is named — match it.)

- [ ] **Step 4: Commit**

```bash
git add app/api/patients/verify/route.ts lib/api/client.ts
git commit -m "feat(satusehat): NIK verification endpoint — local → IHS → auto-create"
```

---

## Phase 5 — Outpatient clinical sync

### Task 10: Common builder helpers + Encounter builder/handler + route wiring

**Files:**
- Create: `lib/satusehat/builders/common.ts`
- Create: `lib/satusehat/builders/encounter.ts`
- Create: `lib/satusehat/handlers/encounter.ts`
- Create: `lib/satusehat/handlers/helpers.ts`
- Modify: `lib/satusehat/handlers/index.ts`
- Modify: `app/api/encounters/route.ts` (POST — enqueue on create), `app/api/encounters/[id]/route.ts` (replace `syncEncounter` with enqueue PUT on finish)
- Test: extend `__tests__/satusehat-builders.test.ts`

**Interfaces:**
- Produces (`builders/common.ts`):

```ts
export const patientRef = (ihs: string, name?: string) => ({ reference: `Patient/${ihs}`, ...(name ? { display: name } : {}) })
export const practitionerRef = (ihs: string, name?: string) => ({ reference: `Practitioner/${ihs}`, ...(name ? { display: name } : {}) })
export const orgRef = (orgId: string) => ({ reference: `Organization/${orgId}` })
export const encounterRef = (ssEncounterId: string) => ({ reference: `Encounter/${ssEncounterId}` })
```

- Produces (`builders/encounter.ts`):

```ts
export interface EncounterInput {
  localId: string; orgId: string
  encClass: 'outpatient' | 'inpatient' | 'emergency' | 'observation'
  status: 'arrived' | 'in_progress' | 'finished'
  patientIhs: string; patientName: string
  practitionerIhs: string; practitionerName: string
  ssLocationId: string; locationName: string
  arrivedAt: string | null; startedAt: string | null; finishedAt: string | null
}
export function buildEncounter(input: EncounterInput): object
```

- Produces (`handlers/helpers.ts`): `ensureLocationSsId(supabase, fhir, locationId): Promise<{ id: string; name: string }>` — POSTs a FHIR Location on first use and persists `locations.ss_location_id`.

- [ ] **Step 1: Write the failing test**

Append to `__tests__/satusehat-builders.test.ts`:

```ts
import { buildEncounter } from '@/lib/satusehat/builders/encounter'

describe('buildEncounter', () => {
  const input = {
    localId: 'enc-uuid-1', orgId: '100012345',
    encClass: 'outpatient' as const, status: 'finished' as const,
    patientIhs: 'P0001', patientName: 'Budi Santoso',
    practitionerIhs: 'N10000001', practitionerName: 'dr. Ani',
    ssLocationId: 'loc-ss-1', locationName: 'Poli Umum',
    arrivedAt: '2026-07-01T08:00:00+07:00',
    startedAt: '2026-07-01T08:30:00+07:00',
    finishedAt: '2026-07-01T09:00:00+07:00',
  }
  it('maps class, refs, identifier system', () => {
    const e: any = buildEncounter(input)
    expect(e.resourceType).toBe('Encounter')
    expect(e.class.code).toBe('AMB')
    expect(e.status).toBe('finished')
    expect(e.identifier[0].system).toBe('http://sys-ids.kemkes.go.id/encounter/100012345')
    expect(e.identifier[0].value).toBe('enc-uuid-1')
    expect(e.subject.reference).toBe('Patient/P0001')
    expect(e.participant[0].individual.reference).toBe('Practitioner/N10000001')
    expect(e.location[0].location.reference).toBe('Location/loc-ss-1')
    expect(e.serviceProvider.reference).toBe('Organization/100012345')
  })
  it('builds full statusHistory from timestamps', () => {
    const e: any = buildEncounter(input)
    expect(e.statusHistory).toEqual([
      { status: 'arrived', period: { start: '2026-07-01T08:00:00+07:00', end: '2026-07-01T08:30:00+07:00' } },
      { status: 'in-progress', period: { start: '2026-07-01T08:30:00+07:00', end: '2026-07-01T09:00:00+07:00' } },
      { status: 'finished', period: { start: '2026-07-01T09:00:00+07:00' } },
    ])
    expect(e.period).toEqual({ start: '2026-07-01T08:00:00+07:00', end: '2026-07-01T09:00:00+07:00' })
  })
  it('maps inpatient → IMP and emergency → EMER', () => {
    expect((buildEncounter({ ...input, encClass: 'inpatient' }) as any).class.code).toBe('IMP')
    expect((buildEncounter({ ...input, encClass: 'emergency' }) as any).class.code).toBe('EMER')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- __tests__/satusehat-builders.test.ts`
Expected: FAIL — cannot resolve builders/encounter

- [ ] **Step 3: Implement builders**

```ts
// lib/satusehat/builders/common.ts
export const patientRef = (ihs: string, name?: string) =>
  ({ reference: `Patient/${ihs}`, ...(name ? { display: name } : {}) })
export const practitionerRef = (ihs: string, name?: string) =>
  ({ reference: `Practitioner/${ihs}`, ...(name ? { display: name } : {}) })
export const orgRef = (orgId: string) => ({ reference: `Organization/${orgId}` })
export const encounterRef = (ssEncounterId: string) => ({ reference: `Encounter/${ssEncounterId}` })
```

```ts
// lib/satusehat/builders/encounter.ts
import { FHIR, encounterIdentifierSystem } from '../config'
import { patientRef, practitionerRef, orgRef } from './common'

const CLASS_MAP = {
  outpatient: { code: 'AMB', display: 'ambulatory' },
  inpatient: { code: 'IMP', display: 'inpatient encounter' },
  emergency: { code: 'EMER', display: 'emergency' },
  observation: { code: 'OBSENC', display: 'observation encounter' },
} as const

export interface EncounterInput {
  localId: string
  orgId: string
  encClass: keyof typeof CLASS_MAP
  status: 'arrived' | 'in_progress' | 'finished'
  patientIhs: string
  patientName: string
  practitionerIhs: string
  practitionerName: string
  ssLocationId: string
  locationName: string
  arrivedAt: string | null
  startedAt: string | null
  finishedAt: string | null
}

export function buildEncounter(input: EncounterInput): object {
  const cls = CLASS_MAP[input.encClass]

  // statusHistory: each phase ends when the next begins
  const history: object[] = []
  if (input.arrivedAt) {
    history.push({ status: 'arrived', period: { start: input.arrivedAt, ...(input.startedAt ? { end: input.startedAt } : {}) } })
  }
  if (input.startedAt) {
    history.push({ status: 'in-progress', period: { start: input.startedAt, ...(input.finishedAt ? { end: input.finishedAt } : {}) } })
  }
  if (input.finishedAt) {
    history.push({ status: 'finished', period: { start: input.finishedAt } })
  }

  const periodStart = input.arrivedAt ?? input.startedAt ?? undefined

  return {
    resourceType: 'Encounter',
    identifier: [{ system: encounterIdentifierSystem(input.orgId), value: input.localId }],
    status: input.status === 'in_progress' ? 'in-progress' : input.status,
    class: { system: FHIR.actCode, code: cls.code, display: cls.display },
    subject: patientRef(input.patientIhs, input.patientName),
    participant: [{
      type: [{ coding: [{ system: FHIR.participationType, code: 'ATND', display: 'attender' }] }],
      individual: practitionerRef(input.practitionerIhs, input.practitionerName),
    }],
    ...(periodStart ? { period: { start: periodStart, ...(input.finishedAt ? { end: input.finishedAt } : {}) } } : {}),
    location: [{ location: { reference: `Location/${input.ssLocationId}`, display: input.locationName } }],
    ...(history.length ? { statusHistory: history } : {}),
    serviceProvider: orgRef(input.orgId),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- __tests__/satusehat-builders.test.ts`
Expected: PASS

- [ ] **Step 5: Implement handler + helpers**

```ts
// lib/satusehat/handlers/helpers.ts
import { SupabaseClient } from '@supabase/supabase-js'
import type { FhirClient } from '../client'
import { ssConfig } from '../config'

/** Get (or lazily create) the SATUSEHAT Location for a local locations row. */
export async function ensureLocationSsId(
  supabase: SupabaseClient,
  fhir: FhirClient,
  locationId: string,
): Promise<{ id: string; name: string }> {
  const { data: loc, error } = await supabase
    .from('locations').select('id, name, ss_location_id').eq('id', locationId).single()
  if (error || !loc) throw new Error(`location ${locationId} not found: ${error?.message}`)
  if (loc.ss_location_id) return { id: loc.ss_location_id, name: loc.name }

  const { orgId } = ssConfig()
  const res = await fhir.post('/Location', {
    resourceType: 'Location',
    identifier: [{ system: `http://sys-ids.kemkes.go.id/location/${orgId}`, value: loc.id }],
    status: 'active',
    name: loc.name,
    mode: 'instance',
    physicalType: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'ro', display: 'Room' }],
    },
    managingOrganization: { reference: `Organization/${orgId}` },
  })
  if (!res.ok) throw new Error(`Location create failed ${res.status}: ${JSON.stringify(res.body)}`)
  const ssId = res.body?.id
  await supabase.from('locations').update({ ss_location_id: ssId }).eq('id', locationId)
  return { id: ssId, name: loc.name }
}

/** Shared ss_sync_logs writer for handlers. */
export async function logSync(supabase: SupabaseClient, entry: {
  resource_type: string; local_id: string; ss_resource_id?: string
  action: string; request_payload: unknown; response_payload: unknown
  http_status: number; status: 'success' | 'failed'; error_message?: string
}) {
  try { await supabase.from('ss_sync_logs').insert(entry) } catch { /* never surface */ }
}
```

```ts
// lib/satusehat/handlers/encounter.ts
import type { SyncHandler } from '../worker'
import { ssConfig } from '../config'
import { buildEncounter, type EncounterInput } from '../builders/encounter'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { ensureLocationSsId, logSync } from './helpers'

export const encounterHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: enc, error } = await supabase
    .from('encounters')
    .select(`
      id, encounter_class, status, arrived_at, started_at, finished_at,
      location_id, ss_encounter_id,
      patients:patient_id ( id, full_name ),
      doctor:doctor_id ( id, full_name ),
      nurse:nurse_id ( id, full_name )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !enc) throw new Error(`encounter ${job.local_id} not found: ${error?.message}`)

  const patient = enc.patients as any
  const practitionerRow = (enc.doctor ?? enc.nurse) as any
  if (!practitionerRow) throw new Error(`encounter ${enc.id} has no doctor or nurse`)
  if (!enc.location_id) throw new Error(`encounter ${enc.id} has no location`)

  const { orgId } = ssConfig()
  const patientIhs = await ensurePatientIhs(supabase, fhir, patient.id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, practitionerRow.id)
  const loc = await ensureLocationSsId(supabase, fhir, enc.location_id)

  const payload = buildEncounter({
    localId: enc.id,
    orgId,
    encClass: enc.encounter_class,
    status: enc.status === 'finished' ? 'finished' : enc.status === 'in_progress' ? 'in_progress' : 'arrived',
    patientIhs, patientName: patient.full_name,
    practitionerIhs, practitionerName: practitionerRow.full_name,
    ssLocationId: loc.id, locationName: loc.name,
    arrivedAt: enc.arrived_at, startedAt: enc.started_at, finishedAt: enc.finished_at,
  } as EncounterInput)

  // Update-in-place if already synced (finish flow), else create
  const res = enc.ss_encounter_id
    ? await fhir.put(`/Encounter/${enc.ss_encounter_id}`, { ...payload, id: enc.ss_encounter_id })
    : await fhir.post('/Encounter', payload)

  await logSync(supabase, {
    resource_type: 'Encounter', local_id: enc.id, ss_resource_id: res.body?.id,
    action: enc.ss_encounter_id ? 'PUT' : 'POST',
    request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('encounters').update({ ss_sync_status: 'failed' }).eq('id', enc.id)
    throw new Error(`Encounter sync failed ${res.status}: ${JSON.stringify(res.body)}`)
  }

  await supabase.from('encounters').update({
    ss_encounter_id: res.body.id,
    ss_sync_status: 'synced',
    ss_synced_at: new Date().toISOString(),
  }).eq('id', enc.id)
}
```

Register in `handlers/index.ts` (accumulates over Tasks 10–18):

```ts
import type { SyncHandler } from '../worker'
import { patientHandler } from './patient'
import { encounterHandler } from './encounter'

export const handlers: Record<string, SyncHandler> = {
  Patient: patientHandler,
  Encounter: encounterHandler,
}
```

- [ ] **Step 6: Wire routes**

In `app/api/encounters/route.ts` POST (encounter creation), after successful insert:

```ts
import { enqueueSync } from '@/lib/satusehat/queue'
// after insert returning `data`:
enqueueSync(supabase, 'Encounter', (data as any).id).catch(() => {})
```

In `app/api/encounters/[id]/route.ts` (finish flow, line ~140), replace:

```ts
syncEncounter(supabase, id, { status: 'finished' }).catch(() => { })
```

with:

```ts
enqueueSync(supabase, 'Encounter', id, 'PUT').catch(() => {})
```

and delete the `import { syncEncounter } from '@/lib/api/satu-sehat'` line.

- [ ] **Step 7: Run full test file, verify, commit**

Run: `pnpm test -- __tests__/satusehat-builders.test.ts __tests__/satusehat-queue.test.ts`
Expected: PASS

```bash
git add lib/satusehat/builders lib/satusehat/handlers app/api/encounters __tests__/satusehat-builders.test.ts
git commit -m "feat(satusehat): Encounter builder/handler with statusHistory + route wiring"
```

---

### Task 11: Observation builder/handler (vital signs)

**Files:**
- Create: `lib/satusehat/builders/observation.ts`
- Create: `lib/satusehat/handlers/observation.ts`
- Modify: `lib/satusehat/handlers/index.ts` (register `Observation`)
- Modify: `app/api/vital-signs/route.ts` (replace `syncVitalSigns` with `enqueueSync(supabase, 'Observation', vs.id)`)
- Test: extend `__tests__/satusehat-builders.test.ts`

**Interfaces:**
- Produces:

```ts
export interface VitalSignsRow {
  id: string; recorded_at: string
  systolic_bp: number | null; diastolic_bp: number | null; heart_rate: number | null
  respiratory_rate: number | null; temperature: number | null; oxygen_saturation: number | null
  weight_kg: number | null; height_cm: number | null; gcs_score: number | null; pain_scale: number | null
}
export interface ObservationContext { patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string }
// returns one Observation per non-null vital, keyed by LOINC code
export function buildVitalObservations(row: VitalSignsRow, ctx: ObservationContext): Array<{ loinc: string; payload: object }>
```

- [ ] **Step 1: Write the failing test**

```ts
import { buildVitalObservations } from '@/lib/satusehat/builders/observation'

describe('buildVitalObservations', () => {
  const ctx = { patientIhs: 'P0001', patientName: 'Budi', practitionerIhs: 'N1', ssEncounterId: 'enc-ss-1' }
  it('emits one Observation per non-null vital with LOINC + UCUM', () => {
    const obs = buildVitalObservations({
      id: 'vs-1', recorded_at: '2026-07-01T08:15:00+07:00',
      systolic_bp: 120, diastolic_bp: 80, heart_rate: 72, respiratory_rate: null,
      temperature: 36.8, oxygen_saturation: null, weight_kg: null, height_cm: null,
      gcs_score: null, pain_scale: null,
    }, ctx)
    expect(obs.map(o => o.loinc).sort()).toEqual(['8310-5', '8462-4', '8480-6', '8867-4'])
    const sys: any = obs.find(o => o.loinc === '8480-6')!.payload
    expect(sys.code.coding[0]).toEqual({ system: 'http://loinc.org', code: '8480-6', display: 'Systolic blood pressure' })
    expect(sys.valueQuantity).toEqual({ value: 120, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' })
    expect(sys.encounter.reference).toBe('Encounter/enc-ss-1')
    expect(sys.category[0].coding[0].code).toBe('vital-signs')
    expect(sys.effectiveDateTime).toBe('2026-07-01T08:15:00+07:00')
  })
  it('returns empty array when all vitals null', () => {
    expect(buildVitalObservations({
      id: 'vs-2', recorded_at: '2026-07-01T08:15:00+07:00',
      systolic_bp: null, diastolic_bp: null, heart_rate: null, respiratory_rate: null,
      temperature: null, oxygen_saturation: null, weight_kg: null, height_cm: null,
      gcs_score: null, pain_scale: null,
    }, ctx)).toEqual([])
  })
})
```

- [ ] **Step 2: Run test — expect FAIL** (`pnpm test -- __tests__/satusehat-builders.test.ts`)

- [ ] **Step 3: Implement builder**

```ts
// lib/satusehat/builders/observation.ts
import { FHIR } from '../config'
import { patientRef, practitionerRef, encounterRef } from './common'

const VITAL_DEFS: Array<{
  field: keyof VitalSignsRow
  loinc: string; display: string; unit: string; ucum: string
}> = [
  { field: 'systolic_bp',       loinc: '8480-6',  display: 'Systolic blood pressure',  unit: 'mmHg',    ucum: 'mm[Hg]' },
  { field: 'diastolic_bp',      loinc: '8462-4',  display: 'Diastolic blood pressure', unit: 'mmHg',    ucum: 'mm[Hg]' },
  { field: 'heart_rate',        loinc: '8867-4',  display: 'Heart rate',               unit: 'beats/minute', ucum: '/min' },
  { field: 'respiratory_rate',  loinc: '9279-1',  display: 'Respiratory rate',         unit: 'breaths/minute', ucum: '/min' },
  { field: 'temperature',       loinc: '8310-5',  display: 'Body temperature',         unit: 'C',       ucum: 'Cel' },
  { field: 'oxygen_saturation', loinc: '2708-6',  display: 'Oxygen saturation in Arterial blood', unit: '%', ucum: '%' },
  { field: 'weight_kg',         loinc: '29463-7', display: 'Body weight',              unit: 'kg',      ucum: 'kg' },
  { field: 'height_cm',         loinc: '8302-2',  display: 'Body height',              unit: 'cm',      ucum: 'cm' },
  { field: 'gcs_score',         loinc: '9269-2',  display: 'Glasgow coma score total', unit: 'score',   ucum: '{score}' },
  { field: 'pain_scale',        loinc: '72514-3', display: 'Pain severity - 0-10 verbal numeric rating', unit: 'score', ucum: '{score}' },
]

export interface VitalSignsRow {
  id: string; recorded_at: string
  systolic_bp: number | null; diastolic_bp: number | null; heart_rate: number | null
  respiratory_rate: number | null; temperature: number | null; oxygen_saturation: number | null
  weight_kg: number | null; height_cm: number | null; gcs_score: number | null; pain_scale: number | null
}

export interface ObservationContext {
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}

export function buildVitalObservations(row: VitalSignsRow, ctx: ObservationContext) {
  return VITAL_DEFS
    .filter(def => row[def.field] !== null && row[def.field] !== undefined)
    .map(def => ({
      loinc: def.loinc,
      payload: {
        resourceType: 'Observation',
        status: 'final',
        category: [{ coding: [{ system: FHIR.obsCategory, code: 'vital-signs', display: 'Vital Signs' }] }],
        code: { coding: [{ system: FHIR.loinc, code: def.loinc, display: def.display }] },
        subject: patientRef(ctx.patientIhs, ctx.patientName),
        performer: [practitionerRef(ctx.practitionerIhs)],
        encounter: encounterRef(ctx.ssEncounterId),
        effectiveDateTime: row.recorded_at,
        valueQuantity: { value: Number(row[def.field]), unit: def.unit, system: FHIR.ucum, code: def.ucum },
      },
    }))
}
```

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Implement handler**

```ts
// lib/satusehat/handlers/observation.ts
import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { buildVitalObservations } from '../builders/observation'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

export const observationHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: vs, error } = await supabase
    .from('vital_signs')
    .select(`*, patients:patient_id ( id, full_name ), encounters:encounter_id ( id, ss_encounter_id ), recorder:recorded_by ( id )`)
    .eq('id', job.local_id)
    .single()
  if (error || !vs) throw new Error(`vital_signs ${job.local_id} not found: ${error?.message}`)

  const enc = vs.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)

  const patientIhs = await ensurePatientIhs(supabase, fhir, (vs.patients as any).id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, (vs.recorder as any).id)

  const observations = buildVitalObservations(vs, {
    patientIhs, patientName: (vs.patients as any).full_name,
    practitionerIhs, ssEncounterId: enc.ss_encounter_id,
  })

  // Resume partially-synced rows: skip LOINCs already in the jsonb map
  const idMap: Record<string, string> = (vs.ss_observation_id as Record<string, string>) ?? {}
  for (const { loinc, payload } of observations) {
    if (idMap[loinc]) continue
    const res = await fhir.post('/Observation', payload)
    await logSync(supabase, {
      resource_type: 'Observation', local_id: vs.id, ss_resource_id: res.body?.id,
      action: 'POST', request_payload: payload, response_payload: res.body ?? {},
      http_status: res.status, status: res.ok ? 'success' : 'failed',
      ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
    })
    if (!res.ok) {
      // persist partial progress before failing
      await supabase.from('vital_signs').update({ ss_observation_id: idMap, ss_sync_status: 'failed' }).eq('id', vs.id)
      throw new Error(`Observation ${loinc} failed ${res.status}: ${JSON.stringify(res.body)}`)
    }
    idMap[loinc] = res.body.id
  }

  await supabase.from('vital_signs')
    .update({ ss_observation_id: idMap, ss_sync_status: 'synced' })
    .eq('id', vs.id)
}
```

Register `Observation: observationHandler` in `handlers/index.ts`.

- [ ] **Step 6: Wire route**

In `app/api/vital-signs/route.ts`, replace the `syncVitalSigns(supabase, (vs as any).id, {...})` call with:

```ts
enqueueSync(supabase, 'Observation', (vs as any).id).catch(() => {})
```

and swap the import from `@/lib/api/satu-sehat` to `@/lib/satusehat/queue`.

- [ ] **Step 7: Test + commit**

Run: `pnpm test`
Expected: all pass.

```bash
git add lib/satusehat/builders/observation.ts lib/satusehat/handlers app/api/vital-signs __tests__/satusehat-builders.test.ts
git commit -m "feat(satusehat): vital signs → FHIR Observations with partial-resume jsonb map"
```

---

### Task 12: Condition builder/handler (diagnoses)

**Files:**
- Create: `lib/satusehat/builders/condition.ts`, `lib/satusehat/handlers/condition.ts`
- Modify: `lib/satusehat/handlers/index.ts` (register `Condition`), `app/api/diagnoses/route.ts` (replace `syncDiagnosis`)
- Test: extend `__tests__/satusehat-builders.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { buildCondition } from '@/lib/satusehat/builders/condition'

describe('buildCondition', () => {
  it('maps ICD-10 with encounter-diagnosis category', () => {
    const c: any = buildCondition({
      icd10Code: 'A09', icd10Display: 'Diare dan gastroenteritis', clinicalStatus: 'active',
      onsetDate: '2026-07-01', patientIhs: 'P0001', patientName: 'Budi', ssEncounterId: 'enc-ss-1',
    })
    expect(c.resourceType).toBe('Condition')
    expect(c.code.coding[0]).toEqual({ system: 'http://hl7.org/fhir/sid/icd-10', code: 'A09', display: 'Diare dan gastroenteritis' })
    expect(c.category[0].coding[0].code).toBe('encounter-diagnosis')
    expect(c.clinicalStatus.coding[0].code).toBe('active')
    expect(c.subject.reference).toBe('Patient/P0001')
    expect(c.encounter.reference).toBe('Encounter/enc-ss-1')
    expect(c.onsetDateTime).toBe('2026-07-01')
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement**

```ts
// lib/satusehat/builders/condition.ts
import { FHIR } from '../config'
import { patientRef, encounterRef } from './common'

export interface ConditionInput {
  icd10Code: string; icd10Display: string
  clinicalStatus: string | null; onsetDate: string | null
  patientIhs: string; patientName: string; ssEncounterId: string
}

export function buildCondition(i: ConditionInput): object {
  return {
    resourceType: 'Condition',
    clinicalStatus: { coding: [{ system: FHIR.conditionClinical, code: i.clinicalStatus ?? 'active' }] },
    category: [{ coding: [{ system: FHIR.conditionCategory, code: 'encounter-diagnosis', display: 'Encounter Diagnosis' }] }],
    code: { coding: [{ system: FHIR.icd10, code: i.icd10Code, display: i.icd10Display }] },
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    ...(i.onsetDate ? { onsetDateTime: i.onsetDate } : {}),
  }
}
```

```ts
// lib/satusehat/handlers/condition.ts
import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { buildCondition } from '../builders/condition'
import { ensurePatientIhs } from '../patient-service'
import { logSync } from './helpers'

export const conditionHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: dx, error } = await supabase
    .from('diagnoses')
    .select(`*, patients:patient_id ( id, full_name ), encounters:encounter_id ( id, ss_encounter_id )`)
    .eq('id', job.local_id)
    .single()
  if (error || !dx) throw new Error(`diagnosis ${job.local_id} not found: ${error?.message}`)

  const enc = dx.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  const patientIhs = await ensurePatientIhs(supabase, fhir, (dx.patients as any).id)

  const payload = buildCondition({
    icd10Code: dx.icd10_code, icd10Display: dx.icd10_display,
    clinicalStatus: dx.clinical_status, onsetDate: dx.onset_date,
    patientIhs, patientName: (dx.patients as any).full_name,
    ssEncounterId: enc.ss_encounter_id,
  })
  const res = await fhir.post('/Condition', payload)
  await logSync(supabase, {
    resource_type: 'Condition', local_id: dx.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('diagnoses').update({ ss_sync_status: 'failed' }).eq('id', dx.id)
    throw new Error(`Condition sync failed ${res.status}`)
  }
  await supabase.from('diagnoses')
    .update({ ss_condition_id: res.body.id, ss_sync_status: 'synced' })
    .eq('id', dx.id)
}
```

Register `Condition: conditionHandler`. In `app/api/diagnoses/route.ts` replace `syncDiagnosis(...)` with `enqueueSync(supabase, 'Condition', (data as any).id).catch(() => {})`.

- [ ] **Step 4: Test PASS + commit**

```bash
git add lib/satusehat/builders/condition.ts lib/satusehat/handlers app/api/diagnoses __tests__/satusehat-builders.test.ts
git commit -m "feat(satusehat): diagnosis → FHIR Condition (ICD-10)"
```

---

### Task 13: AllergyIntolerance builder/handler

**Files:**
- Create: `lib/satusehat/builders/allergy.ts`, `lib/satusehat/handlers/allergy.ts`
- Modify: `lib/satusehat/handlers/index.ts`, `app/api/allergies/route.ts` (POST — add `enqueueSync(supabase, 'AllergyIntolerance', id)`; this route currently has NO sync call)
- Test: extend `__tests__/satusehat-builders.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { buildAllergy } from '@/lib/satusehat/builders/allergy'

describe('buildAllergy', () => {
  it('maps category, criticality, free-text substance and reaction', () => {
    const a: any = buildAllergy({
      substanceDisplay: 'Amoxicillin', category: 'medication', criticality: 'high',
      reactionDescription: 'Ruam kulit', onsetDate: '2020-01-01', isActive: true,
      patientIhs: 'P0001', patientName: 'Budi', ssEncounterId: 'enc-ss-1',
    })
    expect(a.resourceType).toBe('AllergyIntolerance')
    expect(a.clinicalStatus.coding[0].code).toBe('active')
    expect(a.verificationStatus.coding[0].code).toBe('confirmed')
    expect(a.category).toEqual(['medication'])
    expect(a.criticality).toBe('high')
    expect(a.code.text).toBe('Amoxicillin')
    expect(a.reaction[0].manifestation[0].text).toBe('Ruam kulit')
    expect(a.patient.reference).toBe('Patient/P0001')
  })
  it('omits reaction when empty and maps inactive', () => {
    const a: any = buildAllergy({
      substanceDisplay: 'Udang', category: 'food', criticality: 'low',
      reactionDescription: null, onsetDate: null, isActive: false,
      patientIhs: 'P0001', patientName: 'Budi', ssEncounterId: 'enc-ss-1',
    })
    expect(a.clinicalStatus.coding[0].code).toBe('inactive')
    expect(a.reaction).toBeUndefined()
    expect(a.onsetDateTime).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement**

```ts
// lib/satusehat/builders/allergy.ts
import { FHIR } from '../config'
import { patientRef, encounterRef } from './common'

export interface AllergyInput {
  substanceDisplay: string
  category: 'medication' | 'food' | 'environment'
  criticality: 'low' | 'high' | 'unable-to-assess'
  reactionDescription: string | null
  onsetDate: string | null
  isActive: boolean
  patientIhs: string; patientName: string; ssEncounterId: string | null
}

export function buildAllergy(i: AllergyInput): object {
  return {
    resourceType: 'AllergyIntolerance',
    clinicalStatus: { coding: [{ system: FHIR.allergyClinical, code: i.isActive ? 'active' : 'inactive' }] },
    verificationStatus: { coding: [{ system: FHIR.allergyVerification, code: 'confirmed' }] },
    category: [i.category],
    criticality: i.criticality,
    code: { text: i.substanceDisplay },
    patient: patientRef(i.patientIhs, i.patientName),
    ...(i.ssEncounterId ? { encounter: encounterRef(i.ssEncounterId) } : {}),
    ...(i.onsetDate ? { onsetDateTime: i.onsetDate } : {}),
    ...(i.reactionDescription ? { reaction: [{ manifestation: [{ text: i.reactionDescription }] }] } : {}),
  }
}
```

```ts
// lib/satusehat/handlers/allergy.ts
import type { SyncHandler } from '../worker'
import { buildAllergy } from '../builders/allergy'
import { ensurePatientIhs } from '../patient-service'
import { logSync } from './helpers'

export const allergyHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: al, error } = await supabase
    .from('allergy_intolerances')
    .select(`*, patients:patient_id ( id, full_name ), encounters:encounter_id ( id, ss_encounter_id )`)
    .eq('id', job.local_id)
    .single()
  if (error || !al) throw new Error(`allergy ${job.local_id} not found: ${error?.message}`)

  // encounter is optional on allergies — sync without it rather than defer forever
  const patientIhs = await ensurePatientIhs(supabase, fhir, (al.patients as any).id)
  const payload = buildAllergy({
    substanceDisplay: al.substance_display, category: al.category, criticality: al.criticality,
    reactionDescription: al.reaction_description, onsetDate: al.onset_date, isActive: al.is_active,
    patientIhs, patientName: (al.patients as any).full_name,
    ssEncounterId: (al.encounters as any)?.ss_encounter_id ?? null,
  })
  const res = await fhir.post('/AllergyIntolerance', payload)
  await logSync(supabase, {
    resource_type: 'AllergyIntolerance', local_id: al.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('allergy_intolerances').update({ ss_sync_status: 'failed' }).eq('id', al.id)
    throw new Error(`AllergyIntolerance sync failed ${res.status}`)
  }
  await supabase.from('allergy_intolerances')
    .update({ ss_allergy_id: res.body.id, ss_sync_status: 'synced' })
    .eq('id', al.id)
}
```

Register `AllergyIntolerance: allergyHandler`. In `app/api/allergies/route.ts` POST after insert: `enqueueSync(supabase, 'AllergyIntolerance', (data as any).id).catch(() => {})`.

- [ ] **Step 4: Test PASS + commit**

```bash
git add lib/satusehat/builders/allergy.ts lib/satusehat/handlers app/api/allergies __tests__/satusehat-builders.test.ts
git commit -m "feat(satusehat): allergy → FHIR AllergyIntolerance"
```

---

### Task 14: ClinicalImpression (SOAP) + Patient-registration enqueue

**Files:**
- Create: `lib/satusehat/builders/clinical-note.ts`, `lib/satusehat/handlers/clinical-note.ts`
- Modify: `lib/satusehat/handlers/index.ts`, `app/api/clinical-notes/route.ts` (replace `syncClinicalNote`), `app/api/patients/route.ts` (POST — enqueue `Patient` after insert so new registrations get an IHS in background)
- Test: extend `__tests__/satusehat-builders.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { buildClinicalImpression } from '@/lib/satusehat/builders/clinical-note'

describe('buildClinicalImpression', () => {
  it('folds SOAP into summary', () => {
    const c: any = buildClinicalImpression({
      subjective: 'Nyeri kepala', objective: 'TD 120/80', assessment: 'Cephalgia', plan: 'Paracetamol',
      noteDate: '2026-07-01T09:00:00+07:00',
      patientIhs: 'P0001', patientName: 'Budi', practitionerIhs: 'N1', ssEncounterId: 'enc-ss-1',
    })
    expect(c.resourceType).toBe('ClinicalImpression')
    expect(c.status).toBe('completed')
    expect(c.summary).toBe('S: Nyeri kepala\nO: TD 120/80\nA: Cephalgia\nP: Paracetamol')
    expect(c.assessor.reference).toBe('Practitioner/N1')
    expect(c.date).toBe('2026-07-01T09:00:00+07:00')
  })
  it('skips empty SOAP sections', () => {
    const c: any = buildClinicalImpression({
      subjective: 'Nyeri', objective: null, assessment: null, plan: null,
      noteDate: '2026-07-01T09:00:00+07:00',
      patientIhs: 'P0001', patientName: 'Budi', practitionerIhs: 'N1', ssEncounterId: 'enc-ss-1',
    })
    expect(c.summary).toBe('S: Nyeri')
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement**

```ts
// lib/satusehat/builders/clinical-note.ts
import { patientRef, practitionerRef, encounterRef } from './common'

export interface ClinicalNoteInput {
  subjective: string | null; objective: string | null; assessment: string | null; plan: string | null
  noteDate: string
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}

export function buildClinicalImpression(i: ClinicalNoteInput): object {
  const summary = [
    i.subjective ? `S: ${i.subjective}` : null,
    i.objective ? `O: ${i.objective}` : null,
    i.assessment ? `A: ${i.assessment}` : null,
    i.plan ? `P: ${i.plan}` : null,
  ].filter(Boolean).join('\n')

  return {
    resourceType: 'ClinicalImpression',
    status: 'completed',
    description: 'Catatan SOAP',
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    effectiveDateTime: i.noteDate,
    date: i.noteDate,
    assessor: practitionerRef(i.practitionerIhs),
    summary,
  }
}
```

```ts
// lib/satusehat/handlers/clinical-note.ts
import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { buildClinicalImpression } from '../builders/clinical-note'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

export const clinicalNoteHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: note, error } = await supabase
    .from('clinical_notes')
    .select(`*, patients:patient_id ( id, full_name ), encounters:encounter_id ( id, ss_encounter_id ), writer:written_by ( id )`)
    .eq('id', job.local_id)
    .single()
  if (error || !note) throw new Error(`clinical_note ${job.local_id} not found: ${error?.message}`)

  const enc = note.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  const patientIhs = await ensurePatientIhs(supabase, fhir, (note.patients as any).id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, (note.writer as any).id)

  const payload = buildClinicalImpression({
    subjective: note.subjective, objective: note.objective, assessment: note.assessment, plan: note.plan,
    noteDate: note.note_date,
    patientIhs, patientName: (note.patients as any).full_name,
    practitionerIhs, ssEncounterId: enc.ss_encounter_id,
  })
  const res = await fhir.post('/ClinicalImpression', payload)
  await logSync(supabase, {
    resource_type: 'ClinicalImpression', local_id: note.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('clinical_notes').update({ ss_sync_status: 'failed' }).eq('id', note.id)
    throw new Error(`ClinicalImpression sync failed ${res.status}`)
  }
  await supabase.from('clinical_notes')
    .update({ ss_clinical_impression_id: res.body.id, ss_sync_status: 'synced' })
    .eq('id', note.id)
}
```

Register `ClinicalImpression: clinicalNoteHandler`.

Wiring: in `app/api/clinical-notes/route.ts` replace `syncClinicalNote(...)` with `enqueueSync(supabase, 'ClinicalImpression', (data as any).id).catch(() => {})`. In `app/api/patients/route.ts` POST after insert: `enqueueSync(supabase, 'Patient', (data as any).id).catch(() => {})`.

- [ ] **Step 4: Test PASS + commit**

```bash
git add lib/satusehat/builders/clinical-note.ts lib/satusehat/handlers app/api/clinical-notes app/api/patients __tests__/satusehat-builders.test.ts
git commit -m "feat(satusehat): SOAP → ClinicalImpression + patient registration enqueue"
```

---

## Phase 6 — Pharmacy sync

### Task 15: Medication, MedicationRequest, MedicationDispense

**Files:**
- Create: `lib/satusehat/builders/medication.ts`, `lib/satusehat/handlers/medication.ts`
- Modify: `lib/satusehat/handlers/index.ts`, `app/api/prescriptions/route.ts` (enqueue `MedicationRequest` per item), `app/api/prescriptions/[id]/route.ts` (replace `syncDispense`)
- Test: extend `__tests__/satusehat-builders.test.ts`

**Interfaces:**

```ts
// builders/medication.ts
export function buildMedication(i: { localId: string; orgId: string; kfaCode: string | null; name: string }): object
export function buildMedicationRequest(i: {
  prescriptionId: string; itemId: string; orgId: string
  ssMedicationId: string; medicationName: string
  dosage: string | null; frequency: string | null; instructions: string | null
  authoredOn: string
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}): object
export function buildMedicationDispense(i: {
  localId: string; orgId: string
  ssMedicationId: string; medicationName: string; ssMedicationRequestId: string
  quantity: number; whenHandedOver: string
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}): object
```

Handler chain: `MedicationRequest` job (local_id = **prescription_items.id**) first ensures the `medications` row has `ss_medication_id` (POST /Medication lazily, same pattern as Location), then POSTs the request. `MedicationDispense` job (local_id = medication_dispenses.id) defers until its prescription item has `ss_medication_request_id`.

- [ ] **Step 1: Failing test**

```ts
import { buildMedication, buildMedicationRequest, buildMedicationDispense } from '@/lib/satusehat/builders/medication'

describe('pharmacy builders', () => {
  it('buildMedication uses KFA coding', () => {
    const m: any = buildMedication({ localId: 'med-1', orgId: '100012345', kfaCode: '93001019', name: 'Paracetamol 500mg' })
    expect(m.resourceType).toBe('Medication')
    expect(m.code.coding[0]).toEqual({ system: 'http://sys-ids.kemkes.go.id/kfa', code: '93001019', display: 'Paracetamol 500mg' })
    expect(m.identifier[0].system).toBe('http://sys-ids.kemkes.go.id/medication/100012345')
  })
  it('buildMedication falls back to code.text without KFA', () => {
    const m: any = buildMedication({ localId: 'med-2', orgId: '100012345', kfaCode: null, name: 'Racikan X' })
    expect(m.code.coding).toBeUndefined()
    expect(m.code.text).toBe('Racikan X')
  })
  it('buildMedicationRequest references Medication + dosage text', () => {
    const r: any = buildMedicationRequest({
      prescriptionId: 'rx-1', itemId: 'rxi-1', orgId: '100012345',
      ssMedicationId: 'ss-med-1', medicationName: 'Paracetamol 500mg',
      dosage: '500 mg', frequency: '3x1', instructions: 'Sesudah makan',
      authoredOn: '2026-07-01T09:10:00+07:00',
      patientIhs: 'P0001', patientName: 'Budi', practitionerIhs: 'N1', ssEncounterId: 'enc-ss-1',
    })
    expect(r.resourceType).toBe('MedicationRequest')
    expect(r.intent).toBe('order')
    expect(r.medicationReference.reference).toBe('Medication/ss-med-1')
    expect(r.dosageInstruction[0].text).toBe('500 mg 3x1')
    expect(r.dosageInstruction[0].patientInstruction).toBe('Sesudah makan')
    expect(r.requester.reference).toBe('Practitioner/N1')
  })
  it('buildMedicationDispense references the authorizing request', () => {
    const d: any = buildMedicationDispense({
      localId: 'disp-1', orgId: '100012345',
      ssMedicationId: 'ss-med-1', medicationName: 'Paracetamol 500mg', ssMedicationRequestId: 'ss-mr-1',
      quantity: 10, whenHandedOver: '2026-07-01T10:00:00+07:00',
      patientIhs: 'P0001', patientName: 'Budi', practitionerIhs: 'F1', ssEncounterId: 'enc-ss-1',
    })
    expect(d.resourceType).toBe('MedicationDispense')
    expect(d.authorizingPrescription[0].reference).toBe('MedicationRequest/ss-mr-1')
    expect(d.quantity.value).toBe(10)
    expect(d.whenHandedOver).toBe('2026-07-01T10:00:00+07:00')
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement builders**

```ts
// lib/satusehat/builders/medication.ts
import { FHIR, medicationIdentifierSystem, prescriptionIdentifierSystem, prescriptionItemIdentifierSystem } from '../config'
import { patientRef, practitionerRef, encounterRef } from './common'

export function buildMedication(i: { localId: string; orgId: string; kfaCode: string | null; name: string }): object {
  return {
    resourceType: 'Medication',
    meta: { profile: ['https://fhir.kemkes.go.id/r4/StructureDefinition/Medication'] },
    identifier: [{ use: 'official', system: medicationIdentifierSystem(i.orgId), value: i.localId }],
    status: 'active',
    code: i.kfaCode
      ? { coding: [{ system: FHIR.kfa, code: i.kfaCode, display: i.name }] }
      : { text: i.name },
    extension: [{
      url: 'https://fhir.kemkes.go.id/r4/StructureDefinition/MedicationType',
      valueCodeableConcept: {
        coding: [{ system: 'http://terminology.kemkes.go.id/CodeSystem/medication-type', code: 'NC', display: 'Non-compound' }],
      },
    }],
  }
}

export function buildMedicationRequest(i: {
  prescriptionId: string; itemId: string; orgId: string
  ssMedicationId: string; medicationName: string
  dosage: string | null; frequency: string | null; instructions: string | null
  authoredOn: string
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}): object {
  return {
    resourceType: 'MedicationRequest',
    identifier: [
      { use: 'official', system: prescriptionIdentifierSystem(i.orgId), value: i.prescriptionId },
      { use: 'official', system: prescriptionItemIdentifierSystem(i.orgId), value: i.itemId },
    ],
    status: 'active',
    intent: 'order',
    medicationReference: { reference: `Medication/${i.ssMedicationId}`, display: i.medicationName },
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    authoredOn: i.authoredOn,
    requester: practitionerRef(i.practitionerIhs),
    dosageInstruction: [{
      text: [i.dosage, i.frequency].filter(Boolean).join(' '),
      ...(i.instructions ? { patientInstruction: i.instructions } : {}),
    }],
  }
}

export function buildMedicationDispense(i: {
  localId: string; orgId: string
  ssMedicationId: string; medicationName: string; ssMedicationRequestId: string
  quantity: number; whenHandedOver: string
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}): object {
  return {
    resourceType: 'MedicationDispense',
    identifier: [{ use: 'official', system: `http://sys-ids.kemkes.go.id/dispense/${i.orgId}`, value: i.localId }],
    status: 'completed',
    medicationReference: { reference: `Medication/${i.ssMedicationId}`, display: i.medicationName },
    subject: patientRef(i.patientIhs, i.patientName),
    context: encounterRef(i.ssEncounterId),
    performer: [{ actor: practitionerRef(i.practitionerIhs) }],
    authorizingPrescription: [{ reference: `MedicationRequest/${i.ssMedicationRequestId}` }],
    quantity: { value: i.quantity },
    whenHandedOver: i.whenHandedOver,
  }
}
```

- [ ] **Step 4: Run — PASS. Step 5: Implement handlers**

```ts
// lib/satusehat/handlers/medication.ts
import { SupabaseClient } from '@supabase/supabase-js'
import type { FhirClient } from '../client'
import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { ssConfig } from '../config'
import { buildMedication, buildMedicationRequest, buildMedicationDispense } from '../builders/medication'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

async function ensureMedicationSsId(supabase: SupabaseClient, fhir: FhirClient, medicationId: string): Promise<{ id: string; name: string }> {
  const { data: med, error } = await supabase
    .from('medications').select('id, name, kfa_code, ss_medication_id').eq('id', medicationId).single()
  if (error || !med) throw new Error(`medication ${medicationId} not found: ${error?.message}`)
  if (med.ss_medication_id) return { id: med.ss_medication_id, name: med.name }
  const { orgId } = ssConfig()
  const res = await fhir.post('/Medication', buildMedication({ localId: med.id, orgId, kfaCode: med.kfa_code, name: med.name }))
  if (!res.ok) throw new Error(`Medication create failed ${res.status}: ${JSON.stringify(res.body)}`)
  await supabase.from('medications').update({ ss_medication_id: res.body.id }).eq('id', medicationId)
  return { id: res.body.id, name: med.name }
}

// job.local_id = prescription_items.id
export const medicationRequestHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: item, error } = await supabase
    .from('prescription_items')
    .select(`
      id, dosage, frequency, instructions, medication_id, ss_medication_request_id,
      prescriptions:prescription_id (
        id, prescription_date, prescribed_by,
        patients:patient_id ( id, full_name ),
        encounters:encounter_id ( id, ss_encounter_id )
      )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !item) throw new Error(`prescription_item ${job.local_id} not found: ${error?.message}`)
  if (item.ss_medication_request_id) return // idempotent

  const rx = item.prescriptions as any
  const enc = rx.encounters
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)

  const { orgId } = ssConfig()
  const patientIhs = await ensurePatientIhs(supabase, fhir, rx.patients.id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, rx.prescribed_by)
  const med = await ensureMedicationSsId(supabase, fhir, item.medication_id)

  const payload = buildMedicationRequest({
    prescriptionId: rx.id, itemId: item.id, orgId,
    ssMedicationId: med.id, medicationName: med.name,
    dosage: item.dosage, frequency: item.frequency, instructions: item.instructions,
    authoredOn: rx.prescription_date,
    patientIhs, patientName: rx.patients.full_name, practitionerIhs, ssEncounterId: enc.ss_encounter_id,
  })
  const res = await fhir.post('/MedicationRequest', payload)
  await logSync(supabase, {
    resource_type: 'MedicationRequest', local_id: item.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('prescription_items').update({ ss_sync_status: 'failed' }).eq('id', item.id)
    throw new Error(`MedicationRequest sync failed ${res.status}`)
  }
  await supabase.from('prescription_items')
    .update({ ss_medication_request_id: res.body.id, ss_sync_status: 'synced' })
    .eq('id', item.id)
  // mark header synced when all items are done
  const { data: remaining } = await supabase
    .from('prescription_items').select('id').eq('prescription_id', rx.id).neq('ss_sync_status', 'synced')
  if (!remaining?.length) {
    await supabase.from('prescriptions')
      .update({ ss_medication_request_id: res.body.id, ss_sync_status: 'synced' })
      .eq('id', rx.id)
  }
}

// job.local_id = medication_dispenses.id
export const medicationDispenseHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: disp, error } = await supabase
    .from('medication_dispenses')
    .select(`
      id, quantity_dispensed, dispensed_at, dispensed_by, medication_id,
      prescription_item_id,
      patients:patient_id ( id, full_name ),
      encounters:encounter_id ( id, ss_encounter_id ),
      items:prescription_item_id ( id, ss_medication_request_id )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !disp) throw new Error(`dispense ${job.local_id} not found: ${error?.message}`)

  const enc = disp.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  const item = disp.items as any
  if (!item?.ss_medication_request_id) throw new DeferSync(`prescription item ${item?.id} not yet synced`)

  const { orgId } = ssConfig()
  const patientIhs = await ensurePatientIhs(supabase, fhir, (disp.patients as any).id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, disp.dispensed_by)
  const med = await ensureMedicationSsId(supabase, fhir, disp.medication_id)

  const payload = buildMedicationDispense({
    localId: disp.id, orgId,
    ssMedicationId: med.id, medicationName: med.name, ssMedicationRequestId: item.ss_medication_request_id,
    quantity: disp.quantity_dispensed, whenHandedOver: disp.dispensed_at,
    patientIhs, patientName: (disp.patients as any).full_name, practitionerIhs, ssEncounterId: enc.ss_encounter_id,
  })
  const res = await fhir.post('/MedicationDispense', payload)
  await logSync(supabase, {
    resource_type: 'MedicationDispense', local_id: disp.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('medication_dispenses').update({ ss_sync_status: 'failed' }).eq('id', disp.id)
    throw new Error(`MedicationDispense sync failed ${res.status}`)
  }
  await supabase.from('medication_dispenses')
    .update({ ss_medication_dispense_id: res.body.id, ss_sync_status: 'synced' })
    .eq('id', disp.id)
}
```

Register `MedicationRequest: medicationRequestHandler`, `MedicationDispense: medicationDispenseHandler`.

Wiring — `app/api/prescriptions/route.ts`: after inserting prescription items, enqueue each (the route inserts items after the header; adapt to the actual variable holding inserted items):

```ts
for (const item of insertedItems) {
  enqueueSync(supabase, 'MedicationRequest', item.id).catch(() => {})
}
```

Remove `syncPrescription` import/call. `app/api/prescriptions/[id]/route.ts`: replace `syncDispense(supabase, (dispense as any).id ?? '', {})` with `enqueueSync(supabase, 'MedicationDispense', (dispense as any).id).catch(() => {})`.

- [ ] **Step 6: Test PASS + commit**

```bash
git add lib/satusehat/builders/medication.ts lib/satusehat/handlers app/api/prescriptions __tests__/satusehat-builders.test.ts
git commit -m "feat(satusehat): pharmacy chain Medication → MedicationRequest → MedicationDispense"
```

---

## Phase 7 — Inpatient

### Task 16: Composition (resume medis) + inpatient wiring check

Inpatient encounters already flow through the `Encounter` handler (`class = IMP` via `encounter_class`). This task adds the discharge summary Composition and wires inpatient routes.

**Files:**
- Create: `lib/satusehat/builders/composition.ts`, `lib/satusehat/handlers/composition.ts`
- Modify: `lib/satusehat/handlers/index.ts`, `app/api/medical-resumes/route.ts` (POST — enqueue `Composition`)
- Verify: `app/api/inpatient-admissions/route.ts` — encounters created for admissions must hit the same `enqueueSync('Encounter', …)` path as outpatient (add if missing)
- Test: extend `__tests__/satusehat-builders.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { buildComposition } from '@/lib/satusehat/builders/composition'

describe('buildComposition', () => {
  it('builds discharge summary with sections', () => {
    const c: any = buildComposition({
      localId: 'res-1', orgId: '100012345', resumeDate: '2026-07-02T10:00:00+07:00',
      chiefComplaint: 'Demam 3 hari', historyOfIllness: 'Demam naik turun', physicalExamination: 'Suhu 38.5',
      summary: 'DHF grade I, membaik', followUpPlan: 'Kontrol 3 hari',
      patientIhs: 'P0001', patientName: 'Budi', practitionerIhs: 'N1', ssEncounterId: 'enc-ss-1',
    })
    expect(c.resourceType).toBe('Composition')
    expect(c.status).toBe('final')
    expect(c.type.coding[0].code).toBe('18842-5')
    expect(c.title).toBe('Resume Medis')
    expect(c.custodian.reference).toBe('Organization/100012345')
    const titles = c.section.map((s: any) => s.title)
    expect(titles).toContain('Keluhan Utama')
    expect(titles).toContain('Ringkasan')
    const keluhan = c.section.find((s: any) => s.title === 'Keluhan Utama')
    expect(keluhan.text.div).toContain('Demam 3 hari')
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement**

```ts
// lib/satusehat/builders/composition.ts
import { FHIR, compositionIdentifierSystem } from '../config'
import { patientRef, practitionerRef, encounterRef, orgRef } from './common'

export interface CompositionInput {
  localId: string; orgId: string; resumeDate: string
  chiefComplaint: string | null; historyOfIllness: string | null
  physicalExamination: string | null; summary: string | null; followUpPlan: string | null
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function section(title: string, loinc: string, display: string, text: string | null) {
  if (!text) return null
  return {
    title,
    code: { coding: [{ system: FHIR.loinc, code: loinc, display }] },
    text: { status: 'additional', div: `<div xmlns="http://www.w3.org/1999/xhtml">${esc(text)}</div>` },
  }
}

export function buildComposition(i: CompositionInput): object {
  return {
    resourceType: 'Composition',
    identifier: { system: compositionIdentifierSystem(i.orgId), value: i.localId },
    status: 'final',
    type: { coding: [{ system: FHIR.loinc, code: '18842-5', display: 'Discharge summary' }] },
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    date: i.resumeDate,
    author: [practitionerRef(i.practitionerIhs)],
    title: 'Resume Medis',
    custodian: orgRef(i.orgId),
    section: [
      section('Keluhan Utama', '10154-3', 'Chief complaint', i.chiefComplaint),
      section('Riwayat Penyakit', '11348-0', 'History of past illness', i.historyOfIllness),
      section('Pemeriksaan Fisik', '29545-1', 'Physical findings', i.physicalExamination),
      section('Ringkasan', '51848-0', 'Evaluation note', i.summary),
      section('Rencana Tindak Lanjut', '18776-5', 'Plan of care', i.followUpPlan),
    ].filter(Boolean),
  }
}
```

```ts
// lib/satusehat/handlers/composition.ts
import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { ssConfig } from '../config'
import { buildComposition } from '../builders/composition'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

export const compositionHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: resume, error } = await supabase
    .from('medical_resumes')
    .select(`*, patients:patient_id ( id, full_name ), encounters:encounter_id ( id, ss_encounter_id ), author:authored_by ( id )`)
    .eq('id', job.local_id)
    .single()
  if (error || !resume) throw new Error(`medical_resume ${job.local_id} not found: ${error?.message}`)

  const enc = resume.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  const { orgId } = ssConfig()
  const patientIhs = await ensurePatientIhs(supabase, fhir, (resume.patients as any).id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, (resume.author as any).id)

  const payload = buildComposition({
    localId: resume.id, orgId, resumeDate: resume.resume_date,
    chiefComplaint: resume.chief_complaint, historyOfIllness: resume.history_of_illness,
    physicalExamination: resume.physical_examination, summary: resume.summary, followUpPlan: resume.follow_up_plan,
    patientIhs, patientName: (resume.patients as any).full_name, practitionerIhs, ssEncounterId: enc.ss_encounter_id,
  })
  const res = await fhir.post('/Composition', payload)
  await logSync(supabase, {
    resource_type: 'Composition', local_id: resume.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('medical_resumes').update({ ss_sync_status: 'failed' }).eq('id', resume.id)
    throw new Error(`Composition sync failed ${res.status}`)
  }
  await supabase.from('medical_resumes').update({
    ss_composition_id: res.body.id, ss_sync_status: 'synced', ss_synced_at: new Date().toISOString(),
  }).eq('id', resume.id)
}
```

Register `Composition: compositionHandler`. Wire `app/api/medical-resumes/route.ts` POST: `enqueueSync(supabase, 'Composition', (data as any).id).catch(() => {})`.

Then open `app/api/inpatient-admissions/route.ts` and `app/api/emergency/route.ts`: wherever an `encounters` row is inserted, add the same `enqueueSync(supabase, 'Encounter', encounterId).catch(() => {})`; wherever an encounter is finished/discharged, add `enqueueSync(supabase, 'Encounter', encounterId, 'PUT').catch(() => {})`.

- [ ] **Step 4: Test PASS + commit**

```bash
git add lib/satusehat/builders/composition.ts lib/satusehat/handlers app/api/medical-resumes app/api/inpatient-admissions app/api/emergency __tests__/satusehat-builders.test.ts
git commit -m "feat(satusehat): resume medis → Composition + inpatient/emergency encounter wiring"
```

---

## Phase 8 — Procedures + Lab

### Task 17: Procedure builder/handler

**Files:**
- Create: `lib/satusehat/builders/procedure.ts`, `lib/satusehat/handlers/procedure.ts`
- Modify: `lib/satusehat/handlers/index.ts`, `app/api/procedures/route.ts` (POST — enqueue `Procedure`)
- Test: extend `__tests__/satusehat-builders.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { buildProcedure } from '@/lib/satusehat/builders/procedure'

describe('buildProcedure', () => {
  it('maps ICD-9-CM code and performer', () => {
    const p: any = buildProcedure({
      procedureCode: '86.22', procedureDisplay: 'Excisional debridement', performedAt: '2026-07-01T11:00:00+07:00',
      notes: 'Tanpa penyulit', patientIhs: 'P0001', patientName: 'Budi', practitionerIhs: 'N1', ssEncounterId: 'enc-ss-1',
    })
    expect(p.resourceType).toBe('Procedure')
    expect(p.status).toBe('completed')
    expect(p.code.coding[0]).toEqual({ system: 'http://hl7.org/fhir/sid/icd-9-cm', code: '86.22', display: 'Excisional debridement' })
    expect(p.performedDateTime).toBe('2026-07-01T11:00:00+07:00')
    expect(p.performer[0].actor.reference).toBe('Practitioner/N1')
    expect(p.note[0].text).toBe('Tanpa penyulit')
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement**

```ts
// lib/satusehat/builders/procedure.ts
import { FHIR } from '../config'
import { patientRef, practitionerRef, encounterRef } from './common'

export interface ProcedureInput {
  procedureCode: string; procedureDisplay: string; performedAt: string; notes: string | null
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}

export function buildProcedure(i: ProcedureInput): object {
  return {
    resourceType: 'Procedure',
    status: 'completed',
    code: { coding: [{ system: FHIR.icd9cm, code: i.procedureCode, display: i.procedureDisplay }] },
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    performedDateTime: i.performedAt,
    performer: [{ actor: practitionerRef(i.practitionerIhs) }],
    ...(i.notes ? { note: [{ text: i.notes }] } : {}),
  }
}
```

Handler (`lib/satusehat/handlers/procedure.ts`) — same shape as `conditionHandler`: load `procedures` row joining `patients:patient_id(id, full_name)`, `encounters:encounter_id(id, ss_encounter_id)`, `performer:performed_by(id)`; `DeferSync` if encounter unsynced; `ensurePatientIhs` + `ensurePractitionerIhs`; POST `/Procedure`; on success update `procedures.ss_procedure_id` + `ss_sync_status='synced'`; on failure `ss_sync_status='failed'` + throw; always `logSync`. Register `Procedure: procedureHandler`. Wire `app/api/procedures/route.ts` POST: `enqueueSync(supabase, 'Procedure', (data as any).id).catch(() => {})`.

Full handler code:

```ts
// lib/satusehat/handlers/procedure.ts
import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { buildProcedure } from '../builders/procedure'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

export const procedureHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: proc, error } = await supabase
    .from('procedures')
    .select(`*, patients:patient_id ( id, full_name ), encounters:encounter_id ( id, ss_encounter_id ), performer:performed_by ( id )`)
    .eq('id', job.local_id)
    .single()
  if (error || !proc) throw new Error(`procedure ${job.local_id} not found: ${error?.message}`)

  const enc = proc.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  const patientIhs = await ensurePatientIhs(supabase, fhir, (proc.patients as any).id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, (proc.performer as any).id)

  const payload = buildProcedure({
    procedureCode: proc.procedure_code, procedureDisplay: proc.procedure_display,
    performedAt: proc.performed_at, notes: proc.notes,
    patientIhs, patientName: (proc.patients as any).full_name, practitionerIhs, ssEncounterId: enc.ss_encounter_id,
  })
  const res = await fhir.post('/Procedure', payload)
  await logSync(supabase, {
    resource_type: 'Procedure', local_id: proc.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('procedures').update({ ss_sync_status: 'failed' }).eq('id', proc.id)
    throw new Error(`Procedure sync failed ${res.status}`)
  }
  await supabase.from('procedures')
    .update({ ss_procedure_id: res.body.id, ss_sync_status: 'synced' })
    .eq('id', proc.id)
}
```

- [ ] **Step 4: Test PASS + commit**

```bash
git add lib/satusehat/builders/procedure.ts lib/satusehat/handlers app/api/procedures __tests__/satusehat-builders.test.ts
git commit -m "feat(satusehat): tindakan → FHIR Procedure (ICD-9-CM)"
```

---

### Task 18: Lab — ServiceRequest + DiagnosticReport

**Files:**
- Create: `lib/satusehat/builders/lab.ts`, `lib/satusehat/handlers/lab.ts`
- Modify: `lib/satusehat/handlers/index.ts`, `app/api/lab-orders/route.ts` (POST — enqueue `ServiceRequest`), lab result completion route (find the PATCH that sets `lab_orders.status` to completed — likely `app/api/lab-orders/[id]/route.ts` — enqueue `DiagnosticReport`)
- Test: extend `__tests__/satusehat-builders.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { buildServiceRequest, buildDiagnosticReport } from '@/lib/satusehat/builders/lab'

describe('lab builders', () => {
  it('buildServiceRequest lists LOINC-coded items', () => {
    const s: any = buildServiceRequest({
      localId: 'lab-1', orgId: '100012345', orderDate: '2026-07-01T09:30:00+07:00',
      items: [{ loincCode: '718-7', testName: 'Hemoglobin' }],
      clinicalNotes: 'Curiga anemia',
      patientIhs: 'P0001', patientName: 'Budi', practitionerIhs: 'N1', ssEncounterId: 'enc-ss-1',
    })
    expect(s.resourceType).toBe('ServiceRequest')
    expect(s.status).toBe('active')
    expect(s.intent).toBe('original-order')
    expect(s.code.coding[0]).toEqual({ system: 'http://loinc.org', code: '718-7', display: 'Hemoglobin' })
    expect(s.note[0].text).toBe('Curiga anemia')
  })
  it('buildDiagnosticReport aggregates result lines into conclusion', () => {
    const d: any = buildDiagnosticReport({
      localId: 'lab-1', orgId: '100012345', effective: '2026-07-01T12:00:00+07:00',
      ssServiceRequestId: 'ss-sr-1',
      results: [{ testName: 'Hemoglobin', value: '13.5', unit: 'g/dL', referenceRange: '13-17' }],
      patientIhs: 'P0001', patientName: 'Budi', ssEncounterId: 'enc-ss-1',
    })
    expect(d.resourceType).toBe('DiagnosticReport')
    expect(d.status).toBe('final')
    expect(d.basedOn[0].reference).toBe('ServiceRequest/ss-sr-1')
    expect(d.conclusion).toContain('Hemoglobin: 13.5 g/dL (ref: 13-17)')
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement**

```ts
// lib/satusehat/builders/lab.ts
import { FHIR, serviceRequestIdentifierSystem, diagnosticReportIdentifierSystem } from '../config'
import { patientRef, practitionerRef, encounterRef } from './common'

export interface ServiceRequestInput {
  localId: string; orgId: string; orderDate: string
  items: Array<{ loincCode: string | null; testName: string }>
  clinicalNotes: string | null
  patientIhs: string; patientName: string; practitionerIhs: string; ssEncounterId: string
}

export function buildServiceRequest(i: ServiceRequestInput): object {
  const primary = i.items[0]
  return {
    resourceType: 'ServiceRequest',
    identifier: [{ system: serviceRequestIdentifierSystem(i.orgId), value: i.localId }],
    status: 'active',
    intent: 'original-order',
    priority: 'routine',
    category: [{ coding: [{ system: 'http://snomed.info/sct', code: '108252007', display: 'Laboratory procedure' }] }],
    code: primary?.loincCode
      ? { coding: [{ system: FHIR.loinc, code: primary.loincCode, display: primary.testName }], text: i.items.map(x => x.testName).join(', ') }
      : { text: i.items.map(x => x.testName).join(', ') },
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    occurrenceDateTime: i.orderDate,
    authoredOn: i.orderDate,
    requester: practitionerRef(i.practitionerIhs),
    ...(i.clinicalNotes ? { note: [{ text: i.clinicalNotes }] } : {}),
  }
}

export interface DiagnosticReportInput {
  localId: string; orgId: string; effective: string; ssServiceRequestId: string
  results: Array<{ testName: string; value: string | null; unit: string | null; referenceRange: string | null }>
  patientIhs: string; patientName: string; ssEncounterId: string
}

export function buildDiagnosticReport(i: DiagnosticReportInput): object {
  const conclusion = i.results
    .map(r => `${r.testName}: ${r.value ?? '-'}${r.unit ? ` ${r.unit}` : ''}${r.referenceRange ? ` (ref: ${r.referenceRange})` : ''}`)
    .join('\n')
  return {
    resourceType: 'DiagnosticReport',
    identifier: [{ system: diagnosticReportIdentifierSystem(i.orgId), value: i.localId }],
    basedOn: [{ reference: `ServiceRequest/${i.ssServiceRequestId}` }],
    status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0074', code: 'LAB', display: 'Laboratory' }] }],
    code: { text: i.results.map(r => r.testName).join(', ') },
    subject: patientRef(i.patientIhs, i.patientName),
    encounter: encounterRef(i.ssEncounterId),
    effectiveDateTime: i.effective,
    issued: i.effective,
    conclusion,
  }
}
```

Handlers (`lib/satusehat/handlers/lab.ts`):

```ts
// lib/satusehat/handlers/lab.ts
import type { SyncHandler } from '../worker'
import { DeferSync } from '../worker'
import { ssConfig } from '../config'
import { buildServiceRequest, buildDiagnosticReport } from '../builders/lab'
import { ensurePatientIhs } from '../patient-service'
import { ensurePractitionerIhs } from '../practitioner-service'
import { logSync } from './helpers'

export const serviceRequestHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: order, error } = await supabase
    .from('lab_orders')
    .select(`
      id, order_date, clinical_notes, ordered_by, ss_service_request_id,
      patients:patient_id ( id, full_name ),
      encounters:encounter_id ( id, ss_encounter_id ),
      lab_order_items ( id, loinc_code, test_name )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !order) throw new Error(`lab_order ${job.local_id} not found: ${error?.message}`)
  if (order.ss_service_request_id) return

  const enc = order.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  const { orgId } = ssConfig()
  const patientIhs = await ensurePatientIhs(supabase, fhir, (order.patients as any).id)
  const practitionerIhs = await ensurePractitionerIhs(supabase, fhir, order.ordered_by)

  const payload = buildServiceRequest({
    localId: order.id, orgId, orderDate: order.order_date,
    items: (order.lab_order_items as any[]).map(it => ({ loincCode: it.loinc_code, testName: it.test_name })),
    clinicalNotes: order.clinical_notes,
    patientIhs, patientName: (order.patients as any).full_name, practitionerIhs, ssEncounterId: enc.ss_encounter_id,
  })
  const res = await fhir.post('/ServiceRequest', payload)
  await logSync(supabase, {
    resource_type: 'ServiceRequest', local_id: order.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) {
    await supabase.from('lab_orders').update({ ss_sync_status: 'failed' }).eq('id', order.id)
    throw new Error(`ServiceRequest sync failed ${res.status}`)
  }
  await supabase.from('lab_orders')
    .update({ ss_service_request_id: res.body.id, ss_sync_status: 'synced' })
    .eq('id', order.id)
}

export const diagnosticReportHandler: SyncHandler = async (supabase, fhir, job) => {
  const { data: order, error } = await supabase
    .from('lab_orders')
    .select(`
      id, ss_service_request_id, ss_diagnostic_report_id,
      patients:patient_id ( id, full_name ),
      encounters:encounter_id ( id, ss_encounter_id ),
      lab_order_items ( id, test_name, result_value, result_unit, reference_range, result_entered_at )
    `)
    .eq('id', job.local_id)
    .single()
  if (error || !order) throw new Error(`lab_order ${job.local_id} not found: ${error?.message}`)
  if (order.ss_diagnostic_report_id) return

  const enc = order.encounters as any
  if (!enc?.ss_encounter_id) throw new DeferSync(`encounter ${enc?.id} not yet synced`)
  if (!order.ss_service_request_id) throw new DeferSync(`service request for lab_order ${order.id} not yet synced`)
  const { orgId } = ssConfig()
  const patientIhs = await ensurePatientIhs(supabase, fhir, (order.patients as any).id)

  const items = order.lab_order_items as any[]
  const effective = items.find(i => i.result_entered_at)?.result_entered_at ?? new Date().toISOString()
  const payload = buildDiagnosticReport({
    localId: order.id, orgId, effective, ssServiceRequestId: order.ss_service_request_id,
    results: items.map(i => ({ testName: i.test_name, value: i.result_value, unit: i.result_unit, referenceRange: i.reference_range })),
    patientIhs, patientName: (order.patients as any).full_name, ssEncounterId: enc.ss_encounter_id,
  })
  const res = await fhir.post('/DiagnosticReport', payload)
  await logSync(supabase, {
    resource_type: 'DiagnosticReport', local_id: order.id, ss_resource_id: res.body?.id,
    action: 'POST', request_payload: payload, response_payload: res.body ?? {},
    http_status: res.status, status: res.ok ? 'success' : 'failed',
    ...(res.ok ? {} : { error_message: JSON.stringify(res.body).slice(0, 1000) }),
  })
  if (!res.ok) throw new Error(`DiagnosticReport sync failed ${res.status}`)
  await supabase.from('lab_orders')
    .update({ ss_diagnostic_report_id: res.body.id })
    .eq('id', order.id)
}
```

Register `ServiceRequest: serviceRequestHandler`, `DiagnosticReport: diagnosticReportHandler`. Wire: lab order creation route → `enqueueSync(supabase, 'ServiceRequest', orderId)`; the route where lab results are completed (status → completed) → `enqueueSync(supabase, 'DiagnosticReport', orderId)`.

- [ ] **Step 4: Test PASS + commit**

```bash
git add lib/satusehat/builders/lab.ts lib/satusehat/handlers app/api/lab-orders __tests__/satusehat-builders.test.ts
git commit -m "feat(satusehat): lab ServiceRequest + DiagnosticReport"
```

---

## Phase 9 — BPJS mock VClaim

### Task 19: VClaim interface + mock + eligibility route + check-in wiring

BPJS eligibility must run **synchronously on every patient check-in** with `payment_type = 'bpjs'` (user requirement). Real VClaim credentials come later — mock now, swap implementation behind the interface.

**Files:**
- Create: `lib/bpjs/vclaim.ts`
- Create: `app/api/bpjs/eligibility/route.ts`
- Modify: `app/api/walkin/route.ts` (BPJS check before creating appointment)
- Test: `__tests__/bpjs-vclaim.test.ts`

**Interfaces:**

```ts
export interface EligibilityResult {
  eligible: boolean
  bpjsNo: string
  name?: string
  memberClass?: string       // kelas rawat: '1' | '2' | '3'
  memberStatus?: string      // AKTIF | NONAKTIF
  reason?: string            // populated when not eligible
}
export interface VClaimClient {
  checkEligibility(bpjsNo: string, serviceDate: string): Promise<EligibilityResult>
}
export class MockVClaimClient implements VClaimClient { … }
export function getVClaimClient(): VClaimClient   // returns mock until BPJS_CONS_ID env exists
```

- [ ] **Step 1: Failing test**

```ts
// __tests__/bpjs-vclaim.test.ts
import { describe, it, expect } from 'vitest'
import { MockVClaimClient } from '@/lib/bpjs/vclaim'

describe('MockVClaimClient', () => {
  const client = new MockVClaimClient()
  it('accepts a valid 13-digit card number', async () => {
    const r = await client.checkEligibility('0001234567890', '2026-07-02')
    expect(r.eligible).toBe(true)
    expect(r.memberStatus).toBe('AKTIF')
    expect(r.bpjsNo).toBe('0001234567890')
  })
  it('rejects malformed numbers', async () => {
    const r = await client.checkEligibility('12345', '2026-07-02')
    expect(r.eligible).toBe(false)
    expect(r.reason).toContain('13 digit')
  })
  it('simulates inactive members (numbers ending in 99)', async () => {
    const r = await client.checkEligibility('0001234567899', '2026-07-02')
    expect(r.eligible).toBe(false)
    expect(r.memberStatus).toBe('NONAKTIF')
  })
})
```

- [ ] **Step 2: Run — FAIL. Step 3: Implement**

```ts
// lib/bpjs/vclaim.ts
export interface EligibilityResult {
  eligible: boolean
  bpjsNo: string
  name?: string
  memberClass?: string
  memberStatus?: string
  reason?: string
}

export interface VClaimClient {
  checkEligibility(bpjsNo: string, serviceDate: string): Promise<EligibilityResult>
}

/**
 * Mock until real VClaim credentials (BPJS_CONS_ID / BPJS_SECRET_KEY / BPJS_USER_KEY)
 * are provisioned. Deterministic rules so QA can exercise both paths:
 *   - must be 13 digits
 *   - numbers ending in "99" simulate an inactive member
 */
export class MockVClaimClient implements VClaimClient {
  async checkEligibility(bpjsNo: string, _serviceDate: string): Promise<EligibilityResult> {
    if (!/^\d{13}$/.test(bpjsNo)) {
      return { eligible: false, bpjsNo, reason: 'Nomor BPJS harus 13 digit' }
    }
    if (bpjsNo.endsWith('99')) {
      return { eligible: false, bpjsNo, memberStatus: 'NONAKTIF', reason: 'Peserta tidak aktif' }
    }
    return { eligible: true, bpjsNo, memberStatus: 'AKTIF', memberClass: '2', name: undefined }
  }
}

export function getVClaimClient(): VClaimClient {
  // When real creds land: if (process.env.BPJS_CONS_ID) return new RealVClaimClient(...)
  return new MockVClaimClient()
}
```

```ts
// app/api/bpjs/eligibility/route.ts
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { apiResponse } from '@/lib/api/response'
import { requirePractitioner, isGuardError } from '@/lib/api/guards'
import { RATE_LIMITS, rateLimit } from '@/lib/api/rate-limit'
import { getVClaimClient } from '@/lib/bpjs/vclaim'

export async function POST(req: NextRequest) {
  const rl = await rateLimit(req, 'bpjs-eligibility:post', RATE_LIMITS.read)
  if (!rl.allowed) return apiResponse.tooManyRequests(rl.retryAfter!)

  const supabase = await createClient()
  const auth = await requirePractitioner(supabase)
  if (isGuardError(auth)) return auth

  const { bpjs_no, service_date } = await req.json()
  if (!bpjs_no) return apiResponse.badRequest('bpjs_no wajib diisi')

  const result = await getVClaimClient().checkEligibility(
    String(bpjs_no),
    service_date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }),
  )
  return apiResponse.ok(result)
}
```

- [ ] **Step 4: Wire walk-in check-in**

In `app/api/walkin/route.ts` POST, after validating body and **before** the `create_appointment` RPC, add:

```ts
import { getVClaimClient } from '@/lib/bpjs/vclaim'

// … inside POST, after field validation:
if (paymentMethod === 'bpjs') {
  const { data: patient } = await supabase
    .from('patients').select('bpjs_no').eq('id', patientId).single()
  if (!patient?.bpjs_no) {
    return apiResponse.badRequest('Pasien belum memiliki nomor BPJS terdaftar')
  }
  const elig = await getVClaimClient().checkEligibility(patient.bpjs_no, dateStr)
  if (!elig.eligible) {
    return apiResponse.badRequest(`Verifikasi BPJS gagal: ${elig.reason ?? 'peserta tidak aktif'}`)
  }
}
```

(`dateStr` already exists in the route.) Apply the same guard to any other check-in entry point that accepts `payment_type = 'bpjs'` — check `app/api/queue/route.ts` PATCH check-in flow and, if the klinik `/checkin` flow should verify too, note it as a follow-up (klinik is a separate app).

- [ ] **Step 5: Test PASS + commit**

Run: `pnpm test -- __tests__/bpjs-vclaim.test.ts`
Expected: PASS (3 tests)

```bash
git add lib/bpjs/vclaim.ts app/api/bpjs/eligibility/route.ts app/api/walkin/route.ts __tests__/bpjs-vclaim.test.ts
git commit -m "feat(bpjs): mock VClaim eligibility checked on every BPJS check-in"
```

---

## Phase 10 — Cleanup

### Task 20: Remove mock, mark out-of-scope rows, final sweep

**Files:**
- Delete: `lib/api/satu-sehat.ts`
- Modify: `app/api/invoices/route.ts`, `app/api/invoices/[id]/route.ts` (remove `syncInvoice` import/calls; set `ss_sync_status: 'not_required'` when creating/updating invoices)
- Migration (name `ss_mark_not_required`)

- [ ] **Step 1: Remove remaining mock imports**

Run: `grep -rn "lib/api/satu-sehat" app/ lib/ --include='*.ts'`
Expected after edits: no matches. Replace each remaining call site with the appropriate `enqueueSync` (Tasks 10–18 covered them; this is the sweep). Then delete `lib/api/satu-sehat.ts`.

- [ ] **Step 2: Apply data migration**

```sql
-- SATUSEHAT ingests neither Invoice nor EpisodeOfCare
UPDATE public.invoices SET ss_sync_status = 'not_required' WHERE ss_sync_status = 'pending';
UPDATE public.episodes_of_care SET ss_sync_status = 'not_required' WHERE ss_sync_status = 'pending';
```

In `app/api/invoices/route.ts` POST payload, set `ss_sync_status: 'not_required'` on insert so new invoices never look pending.

- [ ] **Step 3: Full test suite + lint**

Run: `pnpm test && pnpm lint`
Expected: all pass, no new lint errors.

- [ ] **Step 4: End-to-end sandbox verification (needs creds)**

1. `npx tsx --env-file=.env scripts/ss-smoke.ts` → SMOKE OK
2. Create walk-in patient with a sandbox dummy NIK → verify → `found_ihs`
3. Check in (BPJS mock number `0001234567890`) → queue created
4. Nurse records vitals → doctor writes SOAP + diagnosis → finish encounter
5. `curl -X POST $BASE_URL/api/ss/worker -H "Authorization: Bearer $CRON_SECRET"` (or wait for kick)
6. Verify in DB: `SELECT resource_type, status, http_status FROM ss_sync_logs ORDER BY created_at DESC LIMIT 20;` → success rows with real SATUSEHAT IDs (`ss_encounter_id` no longer prefixed `ss-encounter-…` but a real UUID from SATUSEHAT)
7. Check SATUSEHAT sandbox dashboard (satusehat.kemkes.go.id portal) shows the submitted resources.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(satusehat): remove mock client, mark invoice/episode sync not_required"
```

---

## Self-Review Notes

- **Spec coverage:** outpatient (Enc/Obs/Cond/Allergy/SOAP ✔), inpatient (IMP encounters + Composition ✔), pharmacy (✔), lab (✔), procedures/surgery (`procedures` covers tindakan incl. `is_surgery` rows ✔), patient data (IHS verify + auto-create ✔), BPJS (mock VClaim at check-in ✔), background builder+sync+status update (outbox worker ✔), BPJS real-time exception (✔).
- **Known deferred items (explicitly out of scope, revisit later):**
  - klinik app check-in (`klinik/app/api/checkin`) does not BPJS-verify — separate app, separate task.
  - Real VClaim client — blocked on credentials.
  - lab Observation-per-result + Specimen resources — DiagnosticReport conclusion carries results for now; `lab_order_items.ss_specimen_id` stays unused.
  - Nutrition orders (`nutrition_orders.ss_nutrition_order_id`) — SATUSEHAT NutritionOrder exists but is low-priority; enqueue pattern is established, add a builder later.
  - Consent module (SATUSEHAT Consent API) — required for production onboarding, not for sandbox resource submission.
- **Type consistency check:** `FhirClient` consumed by all handlers matches Task 3 signature; `enqueueSync(supabase, type, id, action?)` used identically in all wirings; `DeferSync` imported from `../worker` everywhere.
- **Fresh-executor warnings:** exact join aliases (`doctor:doctor_id ( … )`) must match PostgREST syntax — if a join errors at runtime, check the FK name with `information_schema`; `apiResponse.unauthorized()` may be named differently in `lib/api/response.ts` — match the existing helper.
