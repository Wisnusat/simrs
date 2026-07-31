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
  Patient,
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
  Location, LocationType,
  EpisodeOfCare, EpisodeOfCareInput,
  InpatientAdmission, InpatientAdmissionInput, InpatientStatus,
  InpatientDailyRecord, InpatientDailyRecordInput,
  AllergyIntolerance, AllergyInput,
  NutritionOrder, NutritionOrderInput,
  Referral, ReferralInput,
  LabService,
  MasterLabService,
  Practitioner,
  SurgeryRequest,
  SurgeryRequestInput,
  SurgeryPerformer,
  SurgeryPerformerInput,
  MedicalResume,
  MedicalResumeInput,
  RunningBill,
  RunningBillInput,
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
  episode_of_care_id?: string
}): Promise<Encounter[]> {
  const { today, ...rest } = opts ?? {}
  return fetchJson(`/api/encounters${qs({ ...rest, today: today ? '1' : undefined })}`)
}

export async function getPatientHistory(patientId: string, limit = 10): Promise<Encounter[]> {
  return fetchJson(`/api/encounters${qs({ patient_id: patientId, limit: String(limit) })}`)
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

export async function getClinicalNotesByEpisode(episodeOfCareId: string): Promise<ClinicalNote[]> {
  return fetchJson(`/api/clinical-notes${qs({ episode_of_care_id: episodeOfCareId })}`)
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

export interface ICD10Record {
  code: string
  name_en: string
  name_id?: string
}

export async function searchICD10(search: string): Promise<ICD10Record[]> {
  return fetchJson(`/api/icd10${qs({ search })}`)
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

export async function getLabServices(): Promise<LabService[]> {
  return fetchJson<LabService[]>('/api/lab-services')
}

export async function getLabOrders(opts?: {
  encounter_id?: string
  episode_of_care_id?: string
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
  episode_of_care_id?: string
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

// ---------------------------------------------------------------------------
// Locations  /api/locations
// ---------------------------------------------------------------------------

export async function getLocations(opts?: {
  type?: LocationType
}): Promise<Location[]> {
  return fetchJson(`/api/locations${qs(opts ?? {})}`)
}

// ---------------------------------------------------------------------------
// Episodes of Care  /api/episodes-of-care
// ---------------------------------------------------------------------------

export async function getEpisodesOfCare(opts?: {
  status?: InpatientStatus
  patient_id?: string
}): Promise<EpisodeOfCare[]> {
  return fetchJson(`/api/episodes-of-care${qs(opts ?? {})}`)
}

export async function getEpisodeOfCare(episodeId: string): Promise<EpisodeOfCare> {
  return fetchJson(`/api/episodes-of-care/${episodeId}`)
}

export async function postEpisodeOfCare(input: EpisodeOfCareInput): Promise<EpisodeOfCare> {
  return fetchJson('/api/episodes-of-care', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function patchEpisodeOfCare(
  episodeId: string,
  update: Partial<{ status: InpatientStatus; end_date: string; room_location_id: string; bed_number: string }>,
): Promise<EpisodeOfCare> {
  return fetchJson(`/api/episodes-of-care/${episodeId}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  })
}

// ---------------------------------------------------------------------------
// Inpatient Admissions  /api/inpatient-admissions
// ---------------------------------------------------------------------------

export async function getInpatientAdmissions(opts?: {
  status?: InpatientStatus
  dpjp_id?: string
}): Promise<InpatientAdmission[]> {
  return fetchJson(`/api/inpatient-admissions${qs(opts ?? {})}`)
}

export async function getInpatientAdmission(admissionId: string): Promise<InpatientAdmission> {
  return fetchJson(`/api/inpatient-admissions/${admissionId}`)
}

export async function postInpatientAdmission(input: InpatientAdmissionInput): Promise<InpatientAdmission> {
  return fetchJson('/api/inpatient-admissions', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function patchInpatientAdmission(
  admissionId: string,
  update: Partial<{
    status: InpatientStatus
    discharge_summary: string
    room_location_id: string
    bed_number: string
    room_class: string
  }>,
): Promise<InpatientAdmission> {
  return fetchJson(`/api/inpatient-admissions/${admissionId}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  })
}

// ---------------------------------------------------------------------------
// Inpatient Daily Records  /api/inpatient-daily-records
// ---------------------------------------------------------------------------

export async function getInpatientDailyRecords(admissionId: string): Promise<InpatientDailyRecord[]> {
  return fetchJson(`/api/inpatient-daily-records${qs({ admission_id: admissionId })}`)
}

export async function postInpatientDailyRecord(input: InpatientDailyRecordInput): Promise<InpatientDailyRecord> {
  return fetchJson('/api/inpatient-daily-records', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ---------------------------------------------------------------------------
// Allergies  /api/allergies
// ---------------------------------------------------------------------------

export async function getAllergies(patientId: string): Promise<AllergyIntolerance[]> {
  return fetchJson(`/api/allergies${qs({ patient_id: patientId })}`)
}

export async function postAllergy(input: AllergyInput): Promise<AllergyIntolerance> {
  return fetchJson('/api/allergies', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ---------------------------------------------------------------------------
// Nutrition Orders  /api/nutrition-orders
// ---------------------------------------------------------------------------

export async function getNutritionOrders(episodeOfCareId: string): Promise<NutritionOrder[]> {
  return fetchJson(`/api/nutrition-orders${qs({ episode_of_care_id: episodeOfCareId })}`)
}

export async function postNutritionOrder(input: NutritionOrderInput): Promise<NutritionOrder> {
  return fetchJson('/api/nutrition-orders', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function patchNutritionOrder(
  orderId: string,
  update: Partial<NutritionOrderInput & { is_active: boolean }>,
): Promise<NutritionOrder> {
  return fetchJson(`/api/nutrition-orders/${orderId}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  })
}

// ---------------------------------------------------------------------------
// Emergency Encounters  /api/emergency
// ---------------------------------------------------------------------------

export async function getEmergencyEncounters(opts?: {
  status?: string
  search?: string
  page?: number
  limit?: number
}): Promise<{ data: any[], meta: { total: number, page: number, limit: number } }> {
  // Returns raw response since it's wrapped in { data, meta }
  const res = await fetch(`/api/emergency${qs(opts ?? {})}`)
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.error || 'Failed to fetch emergency encounters')
  }
  return res.json()
}

export async function getEmergencyEncounter(id: string): Promise<any> {
  return fetchJson(`/api/emergency/${id}`)
}

export async function postEmergencyEncounter(input: {
  patient_id: string
  triage_category?: string
  triage_complaint?: string
  is_critical?: boolean
  needs_ambulance?: boolean
}): Promise<any> {
  return fetchJson('/api/emergency', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function patchEmergencyEncounter(
  id: string,
  update: Partial<{
    status: string
    triage_category: string
    triage_complaint: string
    resuscitation_notes: string
    outcome: string
    referred_to: string
    referral_letter_no: string
    is_critical: boolean
    needs_ambulance: boolean
  }>,
): Promise<any> {
  return fetchJson(`/api/emergency/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  })
}

export async function patchEmergencyTriage(
  id: string,
  input: {
    triage_category: string
    triage_complaint: string
    is_critical?: boolean
    resuscitation_notes?: string
    needs_ambulance?: boolean
    systolic_bp?: number
    heart_rate?: number
    temperature?: number
    oxygen_saturation?: number
  },
): Promise<any> {
  return fetchJson(`/api/emergency/${id}/triage`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function patchEmergencyOutcome(
  id: string,
  input: {
    outcome: 'discharged' | 'referred' | 'admitted_inpatient'
    referred_to?: string
    referral_letter_no?: string
    admission_data?: {
      room_location_id: string
      bed_number: string
      room_class: string
      dpjp_id: string
    }
  },
): Promise<any> {
  return fetchJson(`/api/emergency/${id}/outcome`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

// ---------------------------------------------------------------------------
// Walk-in Registration  /api/walkin
// ---------------------------------------------------------------------------

export async function postWalkinRegistration(input: {
  patientId: string
  poliServiceId: string
  paymentMethod: string
}): Promise<any> {
  return fetchJson('/api/walkin', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ---------------------------------------------------------------------------
// Referrals  /api/referrals
// ---------------------------------------------------------------------------

export async function postReferral(input: ReferralInput): Promise<Referral> {
  return fetchJson('/api/referrals', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ---------------------------------------------------------------------------
// Admission Requests /api/admission-requests
// ---------------------------------------------------------------------------

export async function getAdmissionRequests(): Promise<EpisodeOfCare[]> {
  return fetchJson<EpisodeOfCare[]>('/api/admission-requests')
}

export async function postInpatientAssignment(input: {
  episode_of_care_id: string
  room_location_id: string
  bed_number: string
  room_class: string
}): Promise<InpatientAdmission> {
  return fetchJson('/api/admission-requests', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ---------------------------------------------------------------------------
// Surgery / OK (Operating Room)  /api/surgery-requests
// ---------------------------------------------------------------------------

export async function getSurgeryRequests(opts?: {
  status?: string
  patient_id?: string
  episode_of_care_id?: string
}): Promise<SurgeryRequest[]> {
  return fetchJson(`/api/surgery-requests${qs(opts ?? {})}`)
}

export async function postSurgeryRequest(
  input: SurgeryRequestInput,
): Promise<SurgeryRequest> {
  return fetchJson('/api/surgery-requests', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function patchSurgeryRequest(
  id: string,
  update: Partial<SurgeryRequest>,
): Promise<SurgeryRequest> {
  return fetchJson(`/api/surgery-requests/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  })
}

export async function getSurgeryPerformers(surgeryRequestId: string): Promise<SurgeryPerformer[]> {
  return fetchJson(`/api/surgery-performers?surgery_request_id=${surgeryRequestId}`)
}

export async function upsertSurgeryPerformers(
  surgeryRequestId: string,
  performers: SurgeryPerformerInput[],
): Promise<SurgeryPerformer[]> {
  return fetchJson('/api/surgery-performers', {
    method: 'PUT',
    body: JSON.stringify({ surgery_request_id: surgeryRequestId, performers }),
  })
}

// ---------------------------------------------------------------------------
// Practitioners  /api/practitioners
// ---------------------------------------------------------------------------

export async function getPractitioners(opts?: {
  role?: string
}): Promise<Practitioner[]> {
  return fetchJson(`/api/practitioners${qs(opts ?? {})}`)
}

// ---------------------------------------------------------------------------
// CMS — Lab Services  /api/cms/lab-services
// ---------------------------------------------------------------------------

export async function getCmsLabServices(): Promise<LabService[]> {
  return fetchJson('/api/cms/lab-services')
}

export async function postCmsLabService(masterId: string): Promise<LabService> {
  return fetchJson('/api/cms/lab-services', {
    method: 'POST',
    body: JSON.stringify({ master_id: masterId }),
  })
}

export async function deleteCmsLabService(id: string): Promise<{ deleted: boolean }> {
  return fetchJson('/api/cms/lab-services', {
    method: 'DELETE',
    body: JSON.stringify({ id }),
  })
}

export async function patchCmsLabServicePrice(id: string, price: number): Promise<LabService> {
  return fetchJson('/api/cms/lab-services', {
    method: 'PATCH',
    body: JSON.stringify({ id, price }),
  })
}

// ---------------------------------------------------------------------------
// CMS — Master Lab Services  /api/cms/master-lab-services
// ---------------------------------------------------------------------------

export interface MasterLabServiceListResult {
  data: MasterLabService[]
  total: number
  page: number
  limit: number
}

export async function getMasterLabServices(opts?: {
  q?: string
  category?: string
  page?: number
  limit?: number
}): Promise<MasterLabServiceListResult> {
  const res = await fetch(`/api/cms/master-lab-services${qs(opts ?? {})}`, {
    headers: { 'Content-Type': 'application/json' },
  })
  const json = await res.json()
  if (!json.success) throw new Error(json.error ?? `Request failed: ${res.status}`)
  return { data: json.data, total: json.meta?.total ?? 0, page: json.meta?.page ?? 1, limit: json.meta?.limit ?? 20 }
}

// ---------------------------------------------------------------------------
// Medical Resumes  /api/medical-resumes
// ---------------------------------------------------------------------------

export async function getMedicalResume(opts: {
  encounter_id?: string
  patient_id?: string
}): Promise<MedicalResume[]> {
  return fetchJson(`/api/medical-resumes${qs(opts)}`)
}

export async function postMedicalResume(input: MedicalResumeInput): Promise<MedicalResume> {
  return fetchJson('/api/medical-resumes', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// ---------------------------------------------------------------------------
// Patient NIK Verification  /api/patients/verify
// ---------------------------------------------------------------------------

/**
 * Verify a 16-digit NIK against local DB and SATUSEHAT.
 * Returns one of three statuses:
 *  - found_local  — patient exists in local DB (IHS refreshed if missing)
 *  - found_ihs    — not local but SATUSEHAT found them; a local patient row was auto-created
 *  - not_found    — neither source recognises the NIK; open full registration form
 */
export async function verifyPatientNik(
  nik: string,
): Promise<{ status: 'found_local' | 'found_ihs' | 'not_found'; patient?: Patient }> {
  return fetchJson('/api/patients/verify', {
    method: 'POST',
    body: JSON.stringify({ nik }),
  })
}

// ---------------------------------------------------------------------------
// Running Bills  /api/running-bills
// ---------------------------------------------------------------------------

export async function getRunningBills(episodeOfCareId: string): Promise<RunningBill[]> {
  return fetchJson(`/api/running-bills?episode_of_care_id=${encodeURIComponent(episodeOfCareId)}`)
}

export async function postRunningBill(input: RunningBillInput): Promise<RunningBill> {
  return fetchJson('/api/running-bills', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function deleteRunningBill(id: string): Promise<void> {
  return fetchJson(`/api/running-bills/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
