/**
 * lib/types/outpatient.ts
 *
 * Domain types for the outpatient (rawat jalan) workflow.
 * All shapes are aligned to the Supabase schema and the API responses
 * returned by /api/outpatient/* routes.
 *
 * Convention: use snake_case to match DB columns verbatim.
 */

// ---------------------------------------------------------------------------
// Primitive enums
// ---------------------------------------------------------------------------

export type QueueStatus = "waiting" | "called" | "in_service" | "done" | "skipped"
export type EncounterStatus = "planned" | "arrived" | "in_progress" | "waiting_lab" | "finished" | "cancelled"
export type LabOrderStatus = "lab_ordered" | "sample_taken" | "processing" | "result_uploaded" | "verified"
export type PrescriptionStatus = "active" | "completed" | "cancelled"
export type InvoiceStatus = "unpaid" | "paid" | "bpjs_claim_pending" | "cancelled"
export type PaymentMethod = "cash" | "card" | "transfer" | "bpjs"
export type DiagnosisType = "primary" | "secondary"
export type ResultStatus = "normal" | "abnormal_low" | "abnormal_high" | "critical"
export type ItemType = "consultation" | "medication" | "action" | "lab"

// ---------------------------------------------------------------------------
// Embedded shapes (referenced from multiple entities)
// ---------------------------------------------------------------------------

export interface Patient {
  id: string
  full_name: string
  medical_record_no: string
  date_of_birth: string
  gender: string
  phone: string
  email?: string
  nik?: string
  bpjs_no?: string
  blood_type?: string
  address?: string
}

export interface Practitioner {
  id: string
  full_name: string
  role: string
  organization_id: string
}

export interface PoliService {
  id: string
  name: string
  code: string
}

export interface AppointmentRef {
  id: string
  chief_complaint: string
  payment_type: string
  booking_code: string
  bpjs_referral_no?: string
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

export interface QueueEntry {
  id: string
  queue_number: string
  queue_prefix: string
  sequence_number: number
  status: QueueStatus
  called_at?: string
  served_at?: string
  done_at?: string
  queue_date: string
  patient_id: string
  appointment_id: string
  poli_service_id: string
  vital_signs_recorded: boolean
  patients: Patient
  appointments: AppointmentRef
  poli_services: PoliService
  encounter: EncounterRef | null
}

export interface EncounterRef {
  id: string
  status: EncounterStatus
}

// ---------------------------------------------------------------------------
// Vital Signs
// ---------------------------------------------------------------------------

export interface VitalSigns {
  id: string
  encounter_id: string
  patient_id: string
  recorded_by: string
  recorded_at: string
  systolic_bp?: number
  diastolic_bp?: number
  heart_rate?: number
  respiratory_rate?: number
  temperature?: number
  oxygen_saturation?: number
  weight_kg?: number
  height_cm?: number
  gcs_score?: number
  pain_scale?: number
  notes?: string
  practitioners?: Pick<Practitioner, "full_name" | "role">
}

export interface VitalSignsInput {
  encounter_id: string
  patient_id: string
  queue_id?: string
  systolic_bp?: number
  diastolic_bp?: number
  heart_rate?: number
  respiratory_rate?: number
  temperature?: number
  oxygen_saturation?: number
  weight_kg?: number
  height_cm?: number
  gcs_score?: number
  pain_scale?: number
  notes?: string
}

// ---------------------------------------------------------------------------
// Encounter
// ---------------------------------------------------------------------------

export interface Encounter {
  id: string
  patient_id: string
  status: EncounterStatus
  started_at?: string
  finished_at?: string
  arrived_at?: string
  doctor_id?: string
  nurse_id?: string
  organization_id: string
  poli_service_id: string
  appointment_id?: string
  payment_type?: string
  patients: Patient
  poli_services: PoliService
  appointments?: AppointmentRef
  vital_signs: VitalSigns[]
  clinical_notes: ClinicalNote[]
  diagnoses: Diagnosis[]
  procedures: Procedure[]
  prescriptions: Prescription[]
  lab_orders: LabOrder[]
}

// ---------------------------------------------------------------------------
// Clinical Notes (SOAP)
// ---------------------------------------------------------------------------

export interface ClinicalNote {
  id: string
  encounter_id: string
  patient_id: string
  written_by: string
  writer_role: string
  note_date: string
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
  practitioners?: Pick<Practitioner, "full_name" | "role">
}

export interface ClinicalNoteInput {
  encounter_id: string
  patient_id: string
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
}

// ---------------------------------------------------------------------------
// Diagnosis
// ---------------------------------------------------------------------------

export interface Diagnosis {
  id: string
  encounter_id: string
  patient_id: string
  recorded_by: string
  icd10_code: string
  icd10_display: string
  diagnosis_type: DiagnosisType
  clinical_status: string
  onset_date?: string
  notes?: string
  practitioners?: Pick<Practitioner, "full_name">
}

export interface DiagnosisInput {
  encounter_id: string
  patient_id: string
  icd10_code: string
  icd10_display: string
  diagnosis_type?: DiagnosisType
}

// ---------------------------------------------------------------------------
// Procedure
// ---------------------------------------------------------------------------

export interface Procedure {
  id: string
  encounter_id: string
  patient_id: string
  performed_by: string
  procedure_code: string
  procedure_display: string
  status: string
  notes?: string
  is_surgery: boolean
  performed_at: string
}

// ---------------------------------------------------------------------------
// Lab Orders
// ---------------------------------------------------------------------------

export interface LabOrderItem {
  id: string
  lab_order_id: string
  test_name: string
  loinc_code: string
  specimen_type?: string
  result_value?: string
  result_unit?: string
  reference_range?: string
  result_status?: ResultStatus
  result_entered_at?: string
  result_entered_by?: string
  notes?: string
}

export interface LabOrder {
  id: string
  encounter_id: string
  patient_id: string
  ordered_by: string
  order_date: string
  priority: "routine" | "urgent" | "stat"
  status: LabOrderStatus
  clinical_notes?: string
  lab_nurse_id?: string
  patients: Pick<Patient, "full_name" | "medical_record_no">
  practitioners: Pick<Practitioner, "full_name">
  lab_order_items: LabOrderItem[]
}

export interface LabOrderInput {
  encounter_id: string
  patient_id: string
  priority?: "routine" | "urgent" | "stat"
  clinical_notes?: string
  items: { test_name: string; loinc_code: string; specimen_type?: string }[]
}

export interface LabResultInput {
  item_id: string
  result_value: string
  result_unit?: string
  reference_range?: string
  result_status?: ResultStatus
  notes?: string
}

// ---------------------------------------------------------------------------
// Medications & Prescriptions
// ---------------------------------------------------------------------------

export interface Medication {
  id: string
  name: string
  generic_name?: string
  brand_name?: string
  form?: string
  strength?: string
  unit?: string
  category?: string
  requires_prescription: boolean
  stock_available: number
}

export interface PrescriptionItem {
  id: string
  prescription_id: string
  medication_id: string
  dosage: string
  frequency?: string
  duration_days?: number
  quantity: number
  instructions?: string
  is_dispensed: boolean
  stock_available?: number
  medications: Pick<Medication, "id" | "name" | "generic_name" | "form" | "strength" | "unit">
}

export interface Prescription {
  id: string
  encounter_id: string
  patient_id: string
  prescribed_by: string
  prescription_date: string
  status: PrescriptionStatus
  patients: Pick<Patient, "full_name" | "medical_record_no">
  practitioners: Pick<Practitioner, "full_name">
  prescription_items: PrescriptionItem[]
}

export interface PrescriptionInput {
  encounter_id: string
  patient_id: string
  items: {
    medication_id: string
    dosage: string
    frequency?: string
    duration_days?: number
    quantity: number
    instructions?: string
  }[]
}

// ---------------------------------------------------------------------------
// Invoice
// ---------------------------------------------------------------------------

export interface InvoiceItem {
  id: string
  invoice_id: string
  item_type: ItemType
  item_name: string
  item_code?: string
  quantity: number
  unit_price: number
  reference_id?: string
}

export interface Invoice {
  id: string
  invoice_number: string
  encounter_id: string
  patient_id: string
  organization_id: string
  invoice_date: string
  payment_type: string
  subtotal: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  paid_amount?: number
  paid_at?: string
  status: InvoiceStatus
  cashier_id?: string
  invoice_items: InvoiceItem[]
  patients: Pick<Patient, "full_name" | "medical_record_no" | "phone">
  encounters?: {
    poli_service_id: string
    poli_services: Pick<PoliService, "name">
    appointment_id?: string
    appointments?: Pick<AppointmentRef, "booking_code" | "chief_complaint">
  }
}
