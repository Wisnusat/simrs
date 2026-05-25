/**
 * lib/types/cms.ts
 *
 * Types specific to the CMS / admin panel.
 */

// ---------------------------------------------------------------------------
// Staff / Practitioner (CMS view)
// ---------------------------------------------------------------------------

export interface StaffMember {
  id: string
  user_id: string | null
  full_name: string
  role: string
  specialization: string | null
  gender: string | null
  phone: string | null
  email: string | null
  nik: string | null
  nip: string | null
  str_number: string | null
  sip_number: string | null
  is_active: boolean
  organization_id: string
  created_at: string
  updated_at: string
}

export interface StaffCreateInput {
  full_name: string
  email: string
  role: string
  specialization?: string
  gender?: string
  phone?: string
  nik?: string
  nip?: string
  str_number?: string
  sip_number?: string
  temp_password?: string
}

export interface StaffUpdateInput {
  full_name?: string
  role?: string
  specialization?: string
  gender?: string
  phone?: string
  email?: string
  nik?: string
  nip?: string
  str_number?: string
  sip_number?: string
  is_active?: boolean
}

// ---------------------------------------------------------------------------
// CMS Content (Landing page)
// ---------------------------------------------------------------------------

export interface CmsContentSection {
  id: string
  organization_id: string
  section_key: string
  content: Record<string, unknown>
  is_active: boolean
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type CmsSectionKey = 'hero' | 'about' | 'services' | 'faq' | 'contact' | 'stats'

export interface HeroContent {
  title: string
  subtitle: string
  cta_primary_text: string
  cta_primary_link: string
  cta_secondary_text: string
  cta_secondary_link: string
  image_url?: string
}

export interface StatsContent {
  items: Array<{ label: string; value: string }>
}

export interface ServiceItem {
  name: string
  description: string
  hours: string
  icon?: string
}

export interface FaqItem {
  question: string
  answer: string
}

export interface ContactContent {
  address: string
  phone: string
  email: string
  emergency_text: string
}

export interface AboutContent {
  title: string
  description: string
  sub_description: string
  highlights: Array<{ title: string; description: string; icon?: string }>
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface ReportFilter {
  from: string   // YYYY-MM-DD
  to: string     // YYYY-MM-DD
}

export interface RevenueReportRow {
  date: string
  total_invoices: number
  subtotal: number
  discount: number
  tax: number
  total: number
  paid: number
  unpaid: number
  payment_umum: number
  payment_bpjs: number
}

export interface PatientVisitReportRow {
  date: string
  total_visits: number
  outpatient: number
  inpatient: number
  emergency: number
  by_poli: Record<string, number>
}

export interface MedicationReportRow {
  medication_id: string
  name: string
  generic_name: string | null
  form: string | null
  strength: string | null
  current_stock: number
  minimum_stock: number
  is_below_minimum: boolean
  dispensed_qty: number
  expiring_batches: number
}

export interface LabReportRow {
  test_name: string
  loinc_code: string
  total_orders: number
  completed: number
  pending: number
}

export interface DiagnosisReportRow {
  icd10_code: string
  icd10_display: string
  total: number
  primary_count: number
  secondary_count: number
}

// ---------------------------------------------------------------------------
// Purchase Orders
// ---------------------------------------------------------------------------

export interface PurchaseOrderSummary {
  id: string
  po_number: string
  order_date: string
  expected_delivery_date: string | null
  status: string
  total_amount: number
  notes: string | null
  created_at: string
  created_by_name: string
  approved_by_name: string | null
  approved_at: string | null
  rejection_reason: string | null
  vendor: {
    id: string
    name: string
    contact_person: string | null
    phone: string | null
  }
  items: PurchaseOrderItem[]
}

export interface PurchaseOrderItem {
  id: string
  medication_name: string
  quantity_ordered: number
  unit_price: number
  subtotal: number
  quantity_received: number
  is_fully_received: boolean
}
