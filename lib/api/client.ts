/**
 * lib/api/client.ts
 *
 * Typed API client — single source of truth for all SIMRS API calls.
 *
 * Rules:
 *  - Every function returns typed data or throws an Error with a user-friendly message.
 *  - No React or hook primitives here — pure async functions only.
 *  - All components and hooks import from this file; no raw fetch() elsewhere.
 *
 * Route map (resource-based, feature-agnostic):
 *   /api/queue            — queue management
 *   /api/vital-signs      — vital signs
 *   /api/encounters       — encounters (CRUD)
 *   /api/clinical-notes   — SOAP notes
 *   /api/diagnoses        — ICD-10 diagnoses
 *   /api/procedures       — clinical procedures
 *   /api/lab-orders       — lab order management
 *   /api/medications      — medication catalogue + stock
 *   /api/prescriptions    — prescriptions + dispense
 *   /api/invoices         — billing + payment
 *   /api/patients         — patient master (existing)
 *   /api/auth             — authentication (existing)
 */

import type {
  QueueEntry, QueueStatus,
  VitalSigns, VitalSignsInput,
  Encounter, EncounterStatus,
  ClinicalNote, ClinicalNoteInput,
  Diagnosis, DiagnosisInput,
  Procedure,
  LabOrder, LabOrderInput, LabOrderStatus, LabResultInput,
  Medication,
  Prescription, PrescriptionInput,
  Invoice, InvoiceStatus, PaymentMethod,
} from '@/lib/types/outpatient'

// ---------------------------------------------------------------------------
// Internal helpers
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
// Queue  /api/queue
// ---------------------------------------------------------------------------

export async function getQueue(opts?: {
  date?: string
  poli_service_id?: string
}): Promise<QueueEntry[]> {
  return fetchJson(`/api/queue${qs(opts ?? {})}`)
}

export async function patchQueueStatus(
  queueId: string,
  status: QueueStatus,
): Promise<QueueEntry> {
  return fetchJson('/api/queue', {
    method: 'PATCH',
    body: JSON.stringify({ queue_id: queueId, status }),
  })
}

// ---------------------------------------------------------------------------
// Vital Signs  /api/vital-signs
// ---------------------------------------------------------------------------

export async function postVitalSigns(input: VitalSignsInput): Promise<VitalSigns> {
  return fetchJson('/api/vital-signs', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getVitalSigns(encounterId: string): Promise<VitalSigns[]> {
  return fetchJson(`/api/vital-signs${qs({ encounter_id: encounterId })}`)
}

// ---------------------------------------------------------------------------
// Encounters  /api/encounters  &  /api/encounters/[id]
// ---------------------------------------------------------------------------

export interface CreateEncounterInput {
  patient_id: string
  poli_service_id: string
  appointment_id?: string
  queue_id?: string
  payment_type?: string
  organization_id?: string
  encounter_class?: string
}

/** Called by nurse when hitting "Panggil" — creates the encounter record. */
export async function createEncounter(input: CreateEncounterInput): Promise<Encounter> {
  return fetchJson('/api/encounters', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/** List encounters, optionally filtered by status and/or today. */
export async function getEncounters(opts?: {
  status?: string
  today?: boolean
  date?: string
}): Promise<Encounter[]> {
  const { today, ...rest } = opts ?? {}
  return fetchJson(`/api/encounters${qs({ ...rest, today: today ? '1' : undefined })}`)
}

export async function getEncounter(encounterId: string): Promise<Encounter> {
  return fetchJson(`/api/encounters/${encounterId}`)
}

export async function patchEncounter(
  encounterId: string,
  update: Partial<{ status: EncounterStatus; doctor_id: string; finished_at: string }>,
): Promise<Encounter> {
  return fetchJson(`/api/encounters/${encounterId}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  })
}

// ---------------------------------------------------------------------------
// Clinical Notes  /api/clinical-notes
// ---------------------------------------------------------------------------

export async function postClinicalNote(input: ClinicalNoteInput): Promise<ClinicalNote> {
  return fetchJson('/api/clinical-notes', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getClinicalNotes(encounterId: string): Promise<ClinicalNote[]> {
  return fetchJson(`/api/clinical-notes${qs({ encounter_id: encounterId })}`)
}

// ---------------------------------------------------------------------------
// Diagnoses  /api/diagnoses
// ---------------------------------------------------------------------------

export async function postDiagnosis(input: DiagnosisInput): Promise<Diagnosis> {
  return fetchJson('/api/diagnoses', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getDiagnoses(encounterId: string): Promise<Diagnosis[]> {
  return fetchJson(`/api/diagnoses${qs({ encounter_id: encounterId })}`)
}

// ---------------------------------------------------------------------------
// Procedures  /api/procedures
// ---------------------------------------------------------------------------

export async function postProcedure(input: {
  encounter_id: string
  patient_id: string
  procedure_code: string
  procedure_display: string
  notes?: string
  is_surgery?: boolean
}): Promise<Procedure> {
  return fetchJson('/api/procedures', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getProcedures(encounterId: string): Promise<Procedure[]> {
  return fetchJson(`/api/procedures${qs({ encounter_id: encounterId })}`)
}

// ---------------------------------------------------------------------------
// Lab Orders  /api/lab-orders
// ---------------------------------------------------------------------------

export async function getLabOrders(opts?: {
  encounter_id?: string
  status?: string
  today?: boolean
}): Promise<LabOrder[]> {
  return fetchJson(
    `/api/lab-orders${qs({ ...opts, today: opts?.today ? '1' : undefined })}`,
  )
}

export async function postLabOrder(input: LabOrderInput): Promise<LabOrder> {
  return fetchJson('/api/lab-orders', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getLabOrder(orderId: string): Promise<LabOrder> {
  return fetchJson(`/api/lab-orders/${orderId}`)
}

export async function patchLabOrderStatus(
  orderId: string,
  status: LabOrderStatus,
): Promise<LabOrder> {
  return fetchJson(`/api/lab-orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function patchLabResults(
  orderId: string,
  item_results: LabResultInput[],
): Promise<{ updated: number }> {
  return fetchJson(`/api/lab-orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify({ item_results }),
  })
}

// ---------------------------------------------------------------------------
// Medications  /api/medications
// ---------------------------------------------------------------------------

export async function getMedications(search?: string): Promise<Medication[]> {
  return fetchJson(`/api/medications${qs({ search })}`)
}

// ---------------------------------------------------------------------------
// Prescriptions  /api/prescriptions
// ---------------------------------------------------------------------------

export async function getPrescriptions(opts?: {
  encounter_id?: string
  status?: string
  today?: boolean
}): Promise<Prescription[]> {
  return fetchJson(
    `/api/prescriptions${qs({ ...opts, today: opts?.today ? '1' : undefined })}`,
  )
}

export async function postPrescription(
  input: PrescriptionInput,
): Promise<{ prescription: Prescription; stock_warnings: string[] }> {
  return fetchJson('/api/prescriptions', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getPrescription(prescriptionId: string): Promise<Prescription> {
  return fetchJson(`/api/prescriptions/${prescriptionId}`)
}

export async function patchPrescriptionStatus(
  prescriptionId: string,
  status: string,
): Promise<Prescription> {
  return fetchJson(`/api/prescriptions/${prescriptionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function dispensePrescription(
  prescriptionId: string,
): Promise<{ dispensed: number; errors: string[] }> {
  return fetchJson(`/api/prescriptions/${prescriptionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ dispense: true }),
  })
}

// ---------------------------------------------------------------------------
// Invoices  /api/invoices
// ---------------------------------------------------------------------------

export async function getInvoices(opts?: {
  encounter_id?: string
  status?: InvoiceStatus | 'all'
  today?: boolean
}): Promise<Invoice | Invoice[]> {
  const { status, today, ...rest } = opts ?? {}
  return fetchJson(
    `/api/invoices${qs({
      ...rest,
      ...(status && status !== 'all' ? { status } : {}),
      today: today ? '1' : undefined,
    })}`,
  )
}

export async function getInvoice(invoiceId: string): Promise<Invoice> {
  return fetchJson(`/api/invoices/${invoiceId}`)
}

export async function payInvoice(
  invoiceId: string,
  opts: { payment_method: PaymentMethod; paid_amount?: number },
): Promise<Invoice> {
  return fetchJson(`/api/invoices/${invoiceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'pay', ...opts }),
  })
}

export async function cancelInvoice(invoiceId: string): Promise<Invoice> {
  return fetchJson(`/api/invoices/${invoiceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ action: 'cancel' }),
  })
}
