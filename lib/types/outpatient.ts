/**
 * lib/types/outpatient.ts
 *
 * Domain types for the outpatient (rawat jalan) and inpatient (rawat inap) workflows.
 * All shapes are aligned to the Supabase schema and the API responses
 * returned by /api/* routes.
 *
 * Convention: use snake_case to match DB columns verbatim.
 */

// ---------------------------------------------------------------------------
// Primitive enums
// ---------------------------------------------------------------------------

export type QueueStatus = "waiting" | "called" | "in_service" | "done" | "skipped"
export type EncounterStatus = "planned" | "arrived" | "in_progress" | "waiting_lab" | "admitted" | "finished" | "cancelled"
export type EncounterClass = "outpatient" | "inpatient" | "emergency" | "observation"
export type LabOrderStatus = "lab_ordered" | "sample_taken" | "processing" | "result_uploaded" | "verified"
export type PrescriptionStatus = "active" | "completed" | "cancelled"
export type InvoiceStatus = "unpaid" | "paid" | "bpjs_claim_pending" | "cancelled"
export type PaymentMethod = "cash" | "card" | "transfer" | "bpjs"
export type DiagnosisType = "primary" | "secondary"
export type ResultStatus = "normal" | "abnormal_low" | "abnormal_high" | "critical"
export type ItemType = "consultation" | "medication" | "action" | "lab" | "room"

// Inpatient-specific enums
export type InpatientStatus = "admitted" | "in_care" | "discharge_approved" | "discharged" | "bpjs_finalized"
export type InpatientRoomClass = "vip" | "kelas_1" | "kelas_2" | "kelas_3"
export type InpatientShift = "pagi" | "sore" | "malam"
export type AllergyCategory = "medication" | "food" | "environment"
export type AllergyCriticality = "low" | "high" | "unable-to-assess"
export type NutritionalStatus = "baik" | "kurang" | "lebih" | "buruk"
export type LocationType = "poli" | "ward" | "patient_room" | "igd" | "ok" | "lab" | "pharmacy"

// Emergency-specific enums
export type EmergencyStatus = "emergency_admitted" | "in_triage" | "in_treatment" | "completed" | "referred_out" | "admitted_to_inpatient"
export type TriageCategory = "P1" | "P2" | "P3" | "P4"
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

export interface LabService {
  id: string
  organization_id: string
  name: string
  loinc_code: string
  category: string
  is_active: boolean
}

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
  file_id?: string
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
  doctor: Pick<Practitioner, "full_name">
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
  file_id?: string
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
    encounter_class?: string
    poli_services: Pick<PoliService, "name">
    appointment_id?: string
    appointments?: Pick<AppointmentRef, "booking_code" | "chief_complaint">
  }
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export interface Location {
  id: string
  organization_id: string
  name: string
  code?: string
  type: LocationType
  floor?: string
  capacity: number
  is_active: boolean
  occupied?: number  // computed: current occupancy count
}

// ---------------------------------------------------------------------------
// Episode of Care
// ---------------------------------------------------------------------------

export interface EpisodeOfCare {
  id: string
  patient_id: string
  organization_id: string
  start_date: string
  end_date?: string
  status: InpatientStatus
  diagnosis_primary?: string
  room_location_id?: string
  bed_number?: string
  dpjp_id?: string
  patients: Pick<Patient, "full_name" | "medical_record_no" | "date_of_birth" | "gender">
  locations?: Pick<Location, "id" | "name" | "type" | "floor">
  dpjp?: Pick<Practitioner, "full_name" | "role">
}

export interface EpisodeOfCareInput {
  patient_id: string
  room_location_id?: string
  bed_number?: string
  dpjp_id: string
  diagnosis_primary?: string
}

// ---------------------------------------------------------------------------
// Inpatient Admission
// ---------------------------------------------------------------------------

export interface InpatientAdmission {
  id: string
  episode_of_care_id: string
  patient_id: string
  admitted_from: string
  admission_date: string
  discharge_date?: string
  dpjp_id: string
  room_location_id: string
  bed_number: string
  room_class: InpatientRoomClass
  status: InpatientStatus
  discharge_approved_by?: string
  discharge_approved_at?: string
  discharge_summary?: string
  sep_number?: string
  bpjs_claim_status?: string
  // Joined data
  patients: Pick<Patient, "full_name" | "medical_record_no" | "date_of_birth" | "gender" | "phone" | "bpjs_no">
  locations: Pick<Location, "id" | "name" | "type" | "floor">
  dpjp: Pick<Practitioner, "full_name" | "role">
  episodes_of_care: Pick<EpisodeOfCare, "id" | "diagnosis_primary" | "start_date">
}

export interface InpatientAdmissionInput {
  episode_of_care_id: string
  patient_id: string
  room_location_id: string
  bed_number: string
  room_class: InpatientRoomClass
  dpjp_id: string
  admitted_from?: string
}

// ---------------------------------------------------------------------------
// Inpatient Daily Record
// ---------------------------------------------------------------------------

export interface InpatientDailyRecord {
  id: string
  admission_id: string
  encounter_id: string
  record_date: string
  shift: InpatientShift
  encounter?: Encounter
}

export interface InpatientDailyRecordInput {
  admission_id: string
  encounter_id: string
  record_date?: string
  shift?: InpatientShift
}

// ---------------------------------------------------------------------------
// Allergy Intolerance
// ---------------------------------------------------------------------------

export interface AllergyIntolerance {
  id: string
  patient_id: string
  recorded_by: string
  encounter_id?: string
  substance_code?: string
  substance_display: string
  category: AllergyCategory
  criticality: AllergyCriticality
  reaction_description?: string
  onset_date?: string
  is_active: boolean
  practitioners?: Pick<Practitioner, "full_name" | "role">
}

export interface AllergyInput {
  patient_id: string
  encounter_id?: string
  substance_display: string
  substance_code?: string
  category?: AllergyCategory
  criticality?: AllergyCriticality
  reaction_description?: string
  onset_date?: string
}

// ---------------------------------------------------------------------------
// Nutrition Order
// ---------------------------------------------------------------------------

export interface NutritionOrder {
  id: string
  episode_of_care_id: string
  patient_id: string
  nutritionist_id: string
  encounter_id?: string
  order_date: string
  nutritional_status?: NutritionalStatus
  dietary_restrictions?: string
  energy_needs_kcal?: number
  protein_needs_g?: number
  meal_plan: Record<string, string>  // { pagi: "...", siang: "...", malam: "..." }
  notes?: string
  is_active: boolean
  practitioners?: Pick<Practitioner, "full_name">
}

export interface NutritionOrderInput {
  episode_of_care_id: string
  patient_id: string
  encounter_id?: string
  nutritional_status?: NutritionalStatus
  dietary_restrictions?: string
  energy_needs_kcal?: number
  protein_needs_g?: number
  meal_plan?: Record<string, string>
  notes?: string
}

export interface EmergencyEncounter {
  id: string
  encounter_id: string
  patient_id: string
  status: EmergencyStatus
  triage_category?: TriageCategory | string
  triage_complaint?: string
  triage_nurse_id?: string
  triaged_at?: string
  is_critical: boolean
  resuscitation_notes?: string
  outcome?: string
  referred_to?: string
  referral_letter_no?: string
  needs_ambulance: boolean
  created_at: string
  updated_at: string

  // Relations
  patients: Patient
  encounters?: Encounter
  triage_nurse?: Practitioner
}

// ---------------------------------------------------------------------------
// Referrals (Rujukan Keluar)
// ---------------------------------------------------------------------------

export type ReferralUrgency = "routine" | "urgent" | "emergency"

export interface Referral {
  id: string
  encounter_id: string
  patient_id: string
  referred_by: string
  destination_facility_name: string
  destination_specialty?: string
  referral_reason: string
  referral_date: string
  urgency: ReferralUrgency
  ss_service_request_id?: string
  ss_sync_status: string
  created_at: string
  updated_at: string
}

export interface ReferralInput {
  encounter_id: string
  patient_id: string
  destination_facility_name: string
  destination_specialty?: string
  referral_reason: string
  urgency?: ReferralUrgency
}

// ---------------------------------------------------------------------------
// Surgery / OK (Operating Room)
// ---------------------------------------------------------------------------

export type SurgeryStatus =
  | "surgery_requested"
  | "surgery_scheduled"
  | "ready_for_surgery"
  | "intra_operative"
  | "surgery_completed"
  | "post_operative"

export interface SurgeryRequest {
  id: string
  patient_id: string
  encounter_id: string
  episode_of_care_id?: string
  requested_by: string
  surgery_type: string
  indication: string
  anesthesia_type?: string
  status: SurgeryStatus
  scheduled_date?: string
  ok_location_id?: string
  surgeon_id?: string
  anesthesiologist_id?: string
  pre_op_assessment?: string
  clearance_status?: string
  surgery_start_at?: string
  surgery_end_at?: string
  intra_op_notes?: string
  post_op_notes?: string
  pacu_notes?: string
  pacu_discharge_at?: string
  needs_inpatient_after: boolean
  ss_procedure_id?: string
  ss_sync_status: string
  created_at: string
  updated_at: string

  // Joined shapes for UI
  patients?: Pick<Patient, "id" | "full_name" | "medical_record_no" | "gender" | "date_of_birth" | "phone">
  doctor?: Pick<Practitioner, "id" | "full_name" | "role">
  surgeon?: Pick<Practitioner, "id" | "full_name" | "role">
  anesthesiologist?: Pick<Practitioner, "id" | "full_name" | "role">
  locations?: Pick<Location, "id" | "name" | "type" | "floor">
}

export interface SurgeryRequestInput {
  patient_id: string
  encounter_id: string
  episode_of_care_id?: string
  surgery_type: string
  indication: string
  anesthesia_type?: string
  needs_inpatient_after?: boolean
}

// ---------------------------------------------------------------------------
// CMS — Lab Services
// ---------------------------------------------------------------------------

export interface MasterLabService {
  id: string
  name: string
  category: string | null
  loinc_code: string
  loinc_display: string | null
  specimen_type: string | null
  unit_local: string | null
  result_type: string | null
}

export interface MedicalResume {
  id: string
  encounter_id: string
  patient_id: string
  authored_by: string
  resume_date: string
  chief_complaint: string | null
  history_of_illness: string | null
  physical_examination: string | null
  summary: string | null
  follow_up_plan: string | null
  created_at: string
  practitioners?: Pick<Practitioner, "full_name" | "role">
}

export interface MedicalResumeInput {
  encounter_id: string
  patient_id: string
  chief_complaint?: string
  history_of_illness?: string
  physical_examination?: string
  summary?: string
  follow_up_plan?: string
}

// ---------------------------------------------------------------------------
// Running Bill
// ---------------------------------------------------------------------------

export interface RunningBill {
  id: string
  episode_of_care_id: string
  patient_id: string
  item_type: string
  item_name: string
  item_code?: string
  quantity: number
  unit_price: number
  subtotal: number
  charge_date: string
  reference_id?: string
  created_at: string
}

export interface RunningBillInput {
  episode_of_care_id: string
  patient_id: string
  item_type: string
  item_name: string
  item_code?: string
  quantity: number
  unit_price: number
  charge_date?: string
}

