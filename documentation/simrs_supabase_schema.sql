-- =============================================================================
-- SIMRS EHR SYSTEM - SUPABASE SCHEMA
-- Integrated with Satu Sehat API (HL7 FHIR R4)
-- Includes Row Level Security (RLS) for all tables
-- =============================================================================
-- Execution order matters. Run this entire file in Supabase SQL Editor.
-- =============================================================================


-- =============================================================================
-- SECTION 0: EXTENSIONS & SETUP
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- SECTION 1: ENUMS
-- =============================================================================

CREATE TYPE user_role AS ENUM (
  'admin',
  'doctor',
  'nurse',
  'lab_nurse',
  'pharmacist',
  'nutritionist',
  'cashier',
  'patient'
);

CREATE TYPE encounter_class AS ENUM (
  'outpatient',   -- rawat jalan
  'inpatient',    -- rawat inap
  'emergency',    -- IGD
  'observation'
);

CREATE TYPE encounter_status AS ENUM (
  'planned',
  'arrived',
  'in_progress',
  'finished',
  'cancelled'
);

CREATE TYPE appointment_status AS ENUM (
  'pending',
  'booked',
  'arrived',
  'checked_in',
  'cancelled',
  'no_show'
);

CREATE TYPE payment_type AS ENUM (
  'umum',
  'bpjs'
);

CREATE TYPE inpatient_status AS ENUM (
  'admitted',
  'in_care',
  'discharge_approved',
  'discharged',
  'bpjs_finalized'
);

CREATE TYPE emergency_status AS ENUM (
  'emergency_admitted',
  'in_triage',
  'in_treatment',
  'completed',
  'referred_out',
  'admitted_to_inpatient'
);

CREATE TYPE surgery_status AS ENUM (
  'surgery_requested',
  'surgery_scheduled',
  'ready_for_surgery',
  'intra_operative',
  'surgery_completed',
  'post_operative'
);

CREATE TYPE lab_order_status AS ENUM (
  'lab_ordered',
  'sample_taken',
  'processing',
  'result_uploaded',
  'verified'
);

CREATE TYPE po_status AS ENUM (
  'po_draft',
  'po_sent',
  'po_partially_received',
  'po_completed',
  'po_cancelled'
);

CREATE TYPE queue_status AS ENUM (
  'waiting',
  'called',
  'in_service',
  'done',
  'skipped'
);

CREATE TYPE gender AS ENUM ('male', 'female', 'other', 'unknown');

CREATE TYPE satu_sehat_sync_status AS ENUM (
  'pending',
  'synced',
  'failed',
  'not_required'
);


-- =============================================================================
-- SECTION 2: CORE / MASTER TABLES
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2.1 Organization (maps to FHIR Organization)
-- -----------------------------------------------------------------------------
CREATE TABLE organizations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'puskesmas', -- puskesmas | klinik | rs
  address         TEXT,
  phone           TEXT,
  email           TEXT,
  head_name       TEXT,                              -- kepala puskesmas/direktur
  -- Satu Sehat
  ss_organization_id  TEXT UNIQUE,                  -- ID from Satu Sehat
  -- Operational hours stored as JSONB for flexibility
  -- e.g. {"senin_jumat": {"open":"08:00","close":"15:00"}, "sabtu": {...}}
  operational_hours   JSONB DEFAULT '{}',
  logo_url            TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2.2 Locations / Rooms (maps to FHIR Location)
-- -----------------------------------------------------------------------------
CREATE TABLE locations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,          -- e.g. "Poli Umum", "IGD", "Kamar 101"
  code            TEXT,                   -- short code
  type            TEXT NOT NULL,          -- poli | ward | room | igd | ok | lab | pharmacy
  floor           TEXT,
  capacity        INT DEFAULT 1,
  -- Satu Sehat
  ss_location_id  TEXT UNIQUE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2.3 Staff / Practitioners (maps to FHIR Practitioner)
-- -----------------------------------------------------------------------------
CREATE TABLE practitioners (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Linked to Supabase auth.users
  user_id         UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nik             TEXT UNIQUE,            -- national ID
  nip             TEXT UNIQUE,            -- employee ID
  str_number      TEXT,                   -- Surat Tanda Registrasi (doctors/nurses)
  sip_number      TEXT,                   -- Surat Izin Praktik
  full_name       TEXT NOT NULL,
  role            user_role NOT NULL,
  specialization  TEXT,                   -- e.g. "Dokter Umum", "Dokter Gigi"
  gender          gender,
  phone           TEXT,
  email           TEXT,
  -- Satu Sehat
  ss_practitioner_id TEXT UNIQUE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2.4 Practitioner Roles / Poli Assignments (maps to FHIR PractitionerRole)
-- -----------------------------------------------------------------------------
CREATE TABLE practitioner_roles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  practitioner_id     UUID NOT NULL REFERENCES practitioners(id) ON DELETE CASCADE,
  location_id         UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  -- Schedule: JSONB for flexibility
  -- e.g. {"days":["monday","tuesday"], "start":"08:00", "end":"14:00"}
  schedule            JSONB DEFAULT '{}',
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  ss_practitioner_role_id TEXT UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2.5 Patients (maps to FHIR Patient + MPI lookup)
-- -----------------------------------------------------------------------------
CREATE TABLE patients (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Linked to Supabase auth.users for patient portal login
  user_id             UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  medical_record_no   TEXT UNIQUE NOT NULL,  -- internal no. rekam medis
  nik                 TEXT UNIQUE,           -- verified with Dukcapil via MPI
  bpjs_no             TEXT UNIQUE,
  full_name           TEXT NOT NULL,
  date_of_birth       DATE NOT NULL,
  gender              gender NOT NULL,
  blood_type          TEXT,
  phone               TEXT,
  email               TEXT,
  address             TEXT,
  city                TEXT,
  province            TEXT,
  postal_code         TEXT,
  -- Emergency contact
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  emergency_contact_relation TEXT,
  -- Satu Sehat MPI
  ss_patient_id       TEXT UNIQUE,           -- ID returned from MPI lookup
  ss_ihs_number       TEXT UNIQUE,           -- IHS number from Satu Sehat
  -- Flags
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2.6 Poli / Healthcare Services (maps to FHIR HealthcareService)
-- -----------------------------------------------------------------------------
CREATE TABLE poli_services (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id         UUID REFERENCES locations(id),
  name                TEXT NOT NULL,         -- "Poli Umum", "Poli Gigi", etc.
  code                TEXT UNIQUE,
  speciality_code     TEXT,                  -- Satu Sehat speciality code e.g. S001.09
  quota_per_day       INT DEFAULT 30,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  ss_healthcare_service_id TEXT UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 3: APPOINTMENTS / ONLINE BOOKING
-- Maps to FHIR: Appointment, AppointmentResponse, Slot
-- =============================================================================

CREATE TABLE appointment_slots (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poli_service_id     UUID NOT NULL REFERENCES poli_services(id) ON DELETE CASCADE,
  practitioner_id     UUID REFERENCES practitioners(id),
  slot_date           DATE NOT NULL,
  start_time          TIME NOT NULL,
  end_time            TIME NOT NULL,
  quota               INT NOT NULL DEFAULT 1,
  booked_count        INT NOT NULL DEFAULT 0,
  is_available        BOOLEAN GENERATED ALWAYS AS (booked_count < quota) STORED,
  ss_slot_id          TEXT UNIQUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE appointments (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  poli_service_id     UUID NOT NULL REFERENCES poli_services(id),
  practitioner_id     UUID REFERENCES practitioners(id),
  slot_id             UUID REFERENCES appointment_slots(id),
  booking_code        TEXT UNIQUE NOT NULL,   -- shown to patient for check-in
  appointment_date    DATE NOT NULL,
  appointment_time    TIME,
  payment_type        payment_type NOT NULL DEFAULT 'umum',
  bpjs_referral_no    TEXT,
  chief_complaint     TEXT,
  status              appointment_status NOT NULL DEFAULT 'pending',
  -- Satu Sehat
  ss_appointment_id   TEXT UNIQUE,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  ss_synced_at        TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 4: QUEUE SYSTEM
-- =============================================================================

CREATE TABLE queues (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  appointment_id      UUID REFERENCES appointments(id),
  patient_id          UUID NOT NULL REFERENCES patients(id),
  poli_service_id     UUID NOT NULL REFERENCES poli_services(id),
  location_id         UUID REFERENCES locations(id),
  queue_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  queue_number        TEXT NOT NULL,          -- e.g. "A023"
  queue_prefix        TEXT NOT NULL DEFAULT 'A',
  sequence_number     INT NOT NULL,
  status              queue_status NOT NULL DEFAULT 'waiting',
  called_at           TIMESTAMPTZ,
  served_at           TIMESTAMPTZ,
  done_at             TIMESTAMPTZ,
  called_by           UUID REFERENCES practitioners(id), -- nurse who called
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poli_service_id, queue_date, sequence_number)
);


-- =============================================================================
-- SECTION 5: ENCOUNTERS (Core of all clinical visits)
-- Maps to FHIR: Encounter, EpisodeOfCare
-- =============================================================================

-- EpisodeOfCare — used for inpatient admission grouping
CREATE TABLE episodes_of_care (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id          UUID NOT NULL REFERENCES patients(id),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  start_date          DATE NOT NULL,
  end_date            DATE,
  status              inpatient_status NOT NULL DEFAULT 'admitted',
  diagnosis_primary   TEXT,                   -- ICD-10 code
  -- Inpatient-specific
  room_location_id    UUID REFERENCES locations(id),
  bed_number          TEXT,
  dpjp_id             UUID REFERENCES practitioners(id),  -- Dokter Penanggung Jawab Pasien
  -- Satu Sehat
  ss_episode_of_care_id TEXT UNIQUE,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  ss_synced_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Main Encounter table
CREATE TABLE encounters (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id          UUID NOT NULL REFERENCES patients(id),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  location_id         UUID REFERENCES locations(id),
  poli_service_id     UUID REFERENCES poli_services(id),
  appointment_id      UUID REFERENCES appointments(id),
  episode_of_care_id  UUID REFERENCES episodes_of_care(id),
  queue_id            UUID REFERENCES queues(id),
  -- Practitioner assignments
  doctor_id           UUID REFERENCES practitioners(id),
  nurse_id            UUID REFERENCES practitioners(id),
  -- Encounter metadata
  encounter_class     encounter_class NOT NULL,
  status              encounter_status NOT NULL DEFAULT 'planned',
  payment_type        payment_type NOT NULL DEFAULT 'umum',
  bpjs_referral_no    TEXT,
  -- Timestamps
  arrived_at          TIMESTAMPTZ,
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  -- Referral info
  is_referred_in      BOOLEAN NOT NULL DEFAULT FALSE,
  referral_from       TEXT,                   -- origin facility name
  referral_letter_no  TEXT,
  -- Satu Sehat
  ss_encounter_id     TEXT UNIQUE,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  ss_synced_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 6: CLINICAL RECORDS
-- Maps to FHIR: Observation, Condition, Procedure, ClinicalImpression,
--               AllergyIntolerance, Composition (resume medis)
-- =============================================================================

-- 6.1 Vital Signs (maps to FHIR Observation)
CREATE TABLE vital_signs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encounter_id        UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id),
  recorded_by         UUID NOT NULL REFERENCES practitioners(id),  -- nurse
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Measurements
  systolic_bp         INT,        -- mmHg
  diastolic_bp        INT,        -- mmHg
  heart_rate          INT,        -- bpm
  respiratory_rate    INT,        -- /min
  temperature         DECIMAL(4,1), -- Celsius
  oxygen_saturation   DECIMAL(5,2), -- %
  weight_kg           DECIMAL(5,2),
  height_cm           DECIMAL(5,2),
  bmi                 DECIMAL(5,2) GENERATED ALWAYS AS (
                        CASE WHEN height_cm > 0 AND weight_kg > 0
                        THEN ROUND((weight_kg / ((height_cm/100) * (height_cm/100)))::NUMERIC, 2)
                        ELSE NULL END
                      ) STORED,
  gcs_score           INT,
  pain_scale          INT CHECK (pain_scale BETWEEN 0 AND 10),
  notes               TEXT,
  -- Satu Sehat
  ss_observation_id   TEXT,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6.2 Diagnoses (maps to FHIR Condition)
CREATE TABLE diagnoses (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encounter_id        UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id),
  recorded_by         UUID NOT NULL REFERENCES practitioners(id),
  icd10_code          TEXT NOT NULL,          -- ICD-10 code
  icd10_display       TEXT NOT NULL,          -- human readable
  diagnosis_type      TEXT NOT NULL DEFAULT 'primary', -- primary | secondary | comorbidity
  clinical_status     TEXT NOT NULL DEFAULT 'active',
  onset_date          DATE,
  notes               TEXT,
  -- Satu Sehat
  ss_condition_id     TEXT UNIQUE,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6.3 Procedures / Tindakan (maps to FHIR Procedure)
CREATE TABLE procedures (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encounter_id        UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id),
  performed_by        UUID NOT NULL REFERENCES practitioners(id),
  procedure_code      TEXT NOT NULL,          -- ICD-9-CM or KPTL code
  procedure_display   TEXT NOT NULL,
  performed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status              TEXT NOT NULL DEFAULT 'completed',
  notes               TEXT,
  -- For surgery / OK module
  is_surgery          BOOLEAN NOT NULL DEFAULT FALSE,
  -- Satu Sehat
  ss_procedure_id     TEXT UNIQUE,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6.4 CPPT — Clinical Notes (maps to FHIR ClinicalImpression)
CREATE TABLE clinical_notes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encounter_id        UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id),
  written_by          UUID NOT NULL REFERENCES practitioners(id),
  writer_role         user_role NOT NULL,     -- doctor | nurse | nutritionist, etc.
  note_date           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- SOAP format
  subjective          TEXT,                   -- S: keluhan pasien
  objective           TEXT,                   -- O: hasil pemeriksaan
  assessment          TEXT,                   -- A: penilaian klinis
  plan                TEXT,                   -- P: rencana tindak lanjut
  -- Satu Sehat
  ss_clinical_impression_id TEXT UNIQUE,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6.5 Allergy Intolerance (maps to FHIR AllergyIntolerance)
CREATE TABLE allergy_intolerances (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id          UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  recorded_by         UUID NOT NULL REFERENCES practitioners(id),
  encounter_id        UUID REFERENCES encounters(id),
  substance_code      TEXT,                   -- SNOMED-CT code
  substance_display   TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'medication', -- medication | food | environment
  criticality         TEXT NOT NULL DEFAULT 'low',        -- low | high | unable-to-assess
  reaction_description TEXT,
  onset_date          DATE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  ss_allergy_id       TEXT UNIQUE,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6.6 Informed Consent
CREATE TABLE informed_consents (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encounter_id        UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id),
  procedure_id        UUID REFERENCES procedures(id),
  consent_type        TEXT NOT NULL,          -- surgery | invasive_procedure | general
  consented_by        TEXT NOT NULL,          -- patient name or guardian name
  relation_to_patient TEXT,                   -- self | parent | spouse | etc.
  consented_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  witness_name        TEXT,
  document_url        TEXT,                   -- signed document stored in Supabase Storage
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6.7 Medical Resume / Composition (maps to FHIR Composition)
CREATE TABLE medical_resumes (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encounter_id        UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id),
  authored_by         UUID NOT NULL REFERENCES practitioners(id),
  resume_date         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chief_complaint     TEXT,
  history_of_illness  TEXT,
  physical_examination TEXT,
  summary             TEXT,
  follow_up_plan      TEXT,
  -- Satu Sehat
  ss_composition_id   TEXT UNIQUE,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  ss_synced_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 7: EMERGENCY (IGD)
-- =============================================================================

CREATE TABLE emergency_encounters (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encounter_id        UUID NOT NULL UNIQUE REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id),
  status              emergency_status NOT NULL DEFAULT 'emergency_admitted',
  -- Triage
  triage_category     TEXT,                   -- P1 | P2 | P3 | P4 (hitam)
  triage_complaint    TEXT,
  triage_nurse_id     UUID REFERENCES practitioners(id),
  triaged_at          TIMESTAMPTZ,
  -- Condition assessment
  is_critical         BOOLEAN NOT NULL DEFAULT FALSE,
  resuscitation_notes TEXT,
  -- Outcome
  outcome             TEXT,                   -- discharged | referred | admitted_inpatient
  referred_to         TEXT,                   -- facility name if referred out
  referral_letter_no  TEXT,
  -- Ambulance
  needs_ambulance     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 8: INPATIENT
-- =============================================================================

CREATE TABLE inpatient_admissions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_of_care_id  UUID NOT NULL UNIQUE REFERENCES episodes_of_care(id) ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id),
  admitted_from       TEXT NOT NULL DEFAULT 'outpatient', -- outpatient | igd | rujukan
  admission_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discharge_date      TIMESTAMPTZ,
  dpjp_id             UUID NOT NULL REFERENCES practitioners(id),
  -- Room assignment
  room_location_id    UUID NOT NULL REFERENCES locations(id),
  bed_number          TEXT NOT NULL,
  room_class          TEXT NOT NULL DEFAULT 'kelas_3', -- kelas_1 | kelas_2 | kelas_3 | vip
  -- Status
  status              inpatient_status NOT NULL DEFAULT 'admitted',
  discharge_approved_by UUID REFERENCES practitioners(id),
  discharge_approved_at TIMESTAMPTZ,
  discharge_summary   TEXT,
  -- BPJS specific
  sep_number          TEXT,                   -- Surat Elegibilitas Peserta
  bpjs_claim_status   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Daily inpatient care records
CREATE TABLE inpatient_daily_records (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admission_id        UUID NOT NULL REFERENCES inpatient_admissions(id) ON DELETE CASCADE,
  encounter_id        UUID NOT NULL REFERENCES encounters(id),
  record_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  shift               TEXT DEFAULT 'pagi',    -- pagi | sore | malam
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 9: SURGERY / OPERASI (OK)
-- =============================================================================

CREATE TABLE surgery_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id          UUID NOT NULL REFERENCES patients(id),
  encounter_id        UUID NOT NULL REFERENCES encounters(id),  -- source encounter
  episode_of_care_id  UUID REFERENCES episodes_of_care(id),
  requested_by        UUID NOT NULL REFERENCES practitioners(id),
  -- Surgery details
  surgery_type        TEXT NOT NULL,
  indication          TEXT NOT NULL,
  anesthesia_type     TEXT,                   -- umum | lokal | regional | spinal
  status              surgery_status NOT NULL DEFAULT 'surgery_requested',
  -- Scheduling
  scheduled_date      TIMESTAMPTZ,
  ok_location_id      UUID REFERENCES locations(id),
  surgeon_id          UUID REFERENCES practitioners(id),
  anesthesiologist_id UUID REFERENCES practitioners(id),
  -- Pre-operative
  pre_op_assessment   TEXT,
  clearance_status    TEXT,
  -- Intra-operative
  surgery_start_at    TIMESTAMPTZ,
  surgery_end_at      TIMESTAMPTZ,
  intra_op_notes      TEXT,
  -- Post-operative
  post_op_notes       TEXT,
  pacu_notes          TEXT,                   -- recovery room notes
  pacu_discharge_at   TIMESTAMPTZ,
  -- Outcome
  needs_inpatient_after BOOLEAN NOT NULL DEFAULT FALSE,
  -- Satu Sehat (maps to FHIR Procedure with surgery flag)
  ss_procedure_id     TEXT UNIQUE,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 10: LABORATORY
-- Maps to FHIR: ServiceRequest, Specimen, Observation, DiagnosticReport
-- =============================================================================

CREATE TABLE lab_orders (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encounter_id        UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id),
  ordered_by          UUID NOT NULL REFERENCES practitioners(id),   -- doctor
  lab_nurse_id        UUID REFERENCES practitioners(id),
  order_date          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status              lab_order_status NOT NULL DEFAULT 'lab_ordered',
  priority            TEXT NOT NULL DEFAULT 'routine',              -- routine | urgent | stat
  clinical_notes      TEXT,
  -- Satu Sehat
  ss_service_request_id TEXT UNIQUE,
  ss_diagnostic_report_id TEXT UNIQUE,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lab_order_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lab_order_id        UUID NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
  loinc_code          TEXT NOT NULL,          -- LOINC code
  test_name           TEXT NOT NULL,
  -- Specimen
  specimen_type       TEXT,                   -- darah | urine | feses | sputum | etc.
  specimen_collected_at TIMESTAMPTZ,
  ss_specimen_id      TEXT UNIQUE,
  -- Result
  result_value        TEXT,
  result_unit         TEXT,
  reference_range     TEXT,
  result_status       TEXT,                   -- normal | abnormal | critical
  result_entered_at   TIMESTAMPTZ,
  result_entered_by   UUID REFERENCES practitioners(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 11: NUTRITION (Gizi)
-- Maps to FHIR: NutritionOrder, CarePlan
-- =============================================================================

CREATE TABLE nutrition_orders (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_of_care_id  UUID NOT NULL REFERENCES episodes_of_care(id) ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id),
  nutritionist_id     UUID NOT NULL REFERENCES practitioners(id),
  encounter_id        UUID REFERENCES encounters(id),
  order_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Nutritional assessment
  nutritional_status  TEXT,                   -- baik | kurang | lebih | buruk
  dietary_restrictions TEXT,                  -- e.g. diabetes, low sodium, etc.
  energy_needs_kcal   INT,
  protein_needs_g     DECIMAL(6,2),
  -- Meal plan (JSONB for flexibility per meal)
  meal_plan           JSONB DEFAULT '{}',
  -- e.g. {"pagi": "bubur+sup", "siang": "nasi+lauk", "malam": "bubur"}
  notes               TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  -- Satu Sehat
  ss_nutrition_order_id TEXT UNIQUE,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 12: PHARMACY
-- Maps to FHIR: Medication, MedicationRequest, MedicationDispense
-- =============================================================================

-- Drug Master (synced with KFA - Kamus Farmasi & Alkes)
CREATE TABLE medications (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  -- KFA Data
  kfa_code            TEXT UNIQUE,            -- KFA product code from Satu Sehat
  name                TEXT NOT NULL,
  generic_name        TEXT,
  brand_name          TEXT,
  form                TEXT,                   -- tablet | kapsul | sirup | injeksi | etc.
  strength            TEXT,                   -- e.g. "500mg", "250mg/5ml"
  unit                TEXT NOT NULL DEFAULT 'tablet',
  category            TEXT,                   -- antibiotik | analgetik | etc.
  is_narcotics        BOOLEAN NOT NULL DEFAULT FALSE,
  is_psychotropics    BOOLEAN NOT NULL DEFAULT FALSE,
  requires_prescription BOOLEAN NOT NULL DEFAULT TRUE,
  -- Satu Sehat
  ss_medication_id    TEXT UNIQUE,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drug Inventory
CREATE TABLE medication_stock (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medication_id       UUID NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  batch_number        TEXT,
  expiry_date         DATE,
  quantity            INT NOT NULL DEFAULT 0,
  minimum_stock       INT NOT NULL DEFAULT 10,
  unit_price          DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_below_minimum    BOOLEAN GENERATED ALWAYS AS (quantity <= minimum_stock) STORED,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (medication_id, batch_number)
);

-- Prescriptions (maps to FHIR MedicationRequest)
CREATE TABLE prescriptions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encounter_id        UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id),
  prescribed_by       UUID NOT NULL REFERENCES practitioners(id),   -- doctor
  prescription_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status              TEXT NOT NULL DEFAULT 'active',               -- active | completed | cancelled
  -- Satu Sehat
  ss_medication_request_id TEXT UNIQUE,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prescription Line Items
CREATE TABLE prescription_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prescription_id     UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  medication_id       UUID NOT NULL REFERENCES medications(id),
  dosage              TEXT NOT NULL,          -- e.g. "3x1 tablet"
  frequency           TEXT,                   -- e.g. "setiap 8 jam"
  duration_days       INT,
  quantity            INT NOT NULL,
  instructions        TEXT,                   -- e.g. "diminum setelah makan"
  is_dispensed        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Medication Dispense (maps to FHIR MedicationDispense)
CREATE TABLE medication_dispenses (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prescription_id     UUID NOT NULL REFERENCES prescriptions(id),
  prescription_item_id UUID REFERENCES prescription_items(id),
  encounter_id        UUID NOT NULL REFERENCES encounters(id),
  patient_id          UUID NOT NULL REFERENCES patients(id),
  dispensed_by        UUID NOT NULL REFERENCES practitioners(id),   -- pharmacist
  medication_id       UUID NOT NULL REFERENCES medications(id),
  stock_id            UUID REFERENCES medication_stock(id),
  quantity_dispensed  INT NOT NULL,
  dispensed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Satu Sehat
  ss_medication_dispense_id TEXT UNIQUE,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 13: PURCHASE ORDER
-- =============================================================================

CREATE TABLE vendors (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  name                TEXT NOT NULL,
  contact_person      TEXT,
  phone               TEXT,
  email               TEXT,
  address             TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_orders (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  vendor_id           UUID NOT NULL REFERENCES vendors(id),
  po_number           TEXT UNIQUE NOT NULL,
  order_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  status              po_status NOT NULL DEFAULT 'po_draft',
  total_amount        DECIMAL(15,2) NOT NULL DEFAULT 0,
  -- Approval
  created_by          UUID NOT NULL REFERENCES practitioners(id),
  approved_by         UUID REFERENCES practitioners(id),
  approved_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id               UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  medication_id       UUID NOT NULL REFERENCES medications(id),
  quantity_ordered    INT NOT NULL,
  unit_price          DECIMAL(12,2) NOT NULL,
  subtotal            DECIMAL(15,2) GENERATED ALWAYS AS (quantity_ordered * unit_price) STORED,
  quantity_received   INT NOT NULL DEFAULT 0,
  received_date       DATE,
  expiry_date         DATE,
  batch_number        TEXT,
  is_fully_received   BOOLEAN GENERATED ALWAYS AS (quantity_received >= quantity_ordered) STORED,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 14: BILLING & INVOICING
-- Maps to FHIR: Invoice, ChargeItem, Claim (BPJS)
-- =============================================================================

CREATE TABLE invoices (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  encounter_id        UUID NOT NULL REFERENCES encounters(id),
  patient_id          UUID NOT NULL REFERENCES patients(id),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  invoice_number      TEXT UNIQUE NOT NULL,
  invoice_date        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_type        payment_type NOT NULL DEFAULT 'umum',
  -- Amounts
  subtotal            DECIMAL(15,2) NOT NULL DEFAULT 0,
  discount_amount     DECIMAL(15,2) NOT NULL DEFAULT 0,
  tax_amount          DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_amount        DECIMAL(15,2) NOT NULL DEFAULT 0,
  paid_amount         DECIMAL(15,2) NOT NULL DEFAULT 0,
  -- Status
  status              TEXT NOT NULL DEFAULT 'unpaid',  -- unpaid | paid | bpjs_claim_pending | bpjs_finalized | cancelled
  paid_at             TIMESTAMPTZ,
  cashier_id          UUID REFERENCES practitioners(id),
  -- BPJS
  bpjs_sep_number     TEXT,
  bpjs_claim_status   TEXT,
  bpjs_claim_amount   DECIMAL(15,2),
  -- Satu Sehat
  ss_invoice_id       TEXT UNIQUE,
  ss_sync_status      satu_sehat_sync_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE invoice_items (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id          UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_type           TEXT NOT NULL,          -- consultation | medication | lab | action | room | nutrition
  item_name           TEXT NOT NULL,
  item_code           TEXT,
  quantity            INT NOT NULL DEFAULT 1,
  unit_price          DECIMAL(12,2) NOT NULL,
  subtotal            DECIMAL(15,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  reference_id        UUID,                   -- ID of the related record (dispense, procedure, etc.)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Running bill for inpatient (tracks charges before final invoice)
CREATE TABLE running_bills (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_of_care_id  UUID NOT NULL REFERENCES episodes_of_care(id) ON DELETE CASCADE,
  patient_id          UUID NOT NULL REFERENCES patients(id),
  item_type           TEXT NOT NULL,
  item_name           TEXT NOT NULL,
  item_code           TEXT,
  quantity            INT NOT NULL DEFAULT 1,
  unit_price          DECIMAL(12,2) NOT NULL,
  subtotal            DECIMAL(15,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  charge_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_id        UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 15: SATU SEHAT SYNC LOG
-- =============================================================================

CREATE TABLE ss_sync_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resource_type       TEXT NOT NULL,          -- Encounter | Condition | Observation | etc.
  local_id            UUID NOT NULL,          -- ID in our system
  ss_resource_id      TEXT,                   -- UUID returned by Satu Sehat
  action              TEXT NOT NULL,          -- POST | PUT | PATCH
  request_payload     JSONB,
  response_payload    JSONB,
  http_status         INT,
  status              TEXT NOT NULL,          -- success | failed
  error_message       TEXT,
  retry_count         INT NOT NULL DEFAULT 0,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 16: AUDIT LOG
-- =============================================================================

CREATE TABLE audit_logs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID REFERENCES auth.users(id),
  action              TEXT NOT NULL,          -- INSERT | UPDATE | DELETE | LOGIN | ACCESS
  table_name          TEXT,
  record_id           UUID,
  old_data            JSONB,
  new_data            JSONB,
  ip_address          INET,
  user_agent          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- SECTION 17: INDEXES FOR PERFORMANCE
-- =============================================================================

CREATE INDEX idx_patients_nik ON patients(nik);
CREATE INDEX idx_patients_medical_record_no ON patients(medical_record_no);
CREATE INDEX idx_patients_bpjs_no ON patients(bpjs_no);
CREATE INDEX idx_patients_user_id ON patients(user_id);

CREATE INDEX idx_encounters_patient_id ON encounters(patient_id);
CREATE INDEX idx_encounters_organization_id ON encounters(organization_id);
CREATE INDEX idx_encounters_status ON encounters(status);
CREATE INDEX idx_encounters_encounter_class ON encounters(encounter_class);
CREATE INDEX idx_encounters_doctor_id ON encounters(doctor_id);

CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_booking_code ON appointments(booking_code);

CREATE INDEX idx_queues_poli_date ON queues(poli_service_id, queue_date);
CREATE INDEX idx_queues_status ON queues(status);

CREATE INDEX idx_diagnoses_encounter_id ON diagnoses(encounter_id);
CREATE INDEX idx_diagnoses_icd10 ON diagnoses(icd10_code);

CREATE INDEX idx_vital_signs_encounter_id ON vital_signs(encounter_id);

CREATE INDEX idx_lab_orders_encounter_id ON lab_orders(encounter_id);
CREATE INDEX idx_lab_orders_status ON lab_orders(status);

CREATE INDEX idx_prescriptions_encounter_id ON prescriptions(encounter_id);
CREATE INDEX idx_medication_stock_medication ON medication_stock(medication_id);
CREATE INDEX idx_medication_stock_below_min ON medication_stock(is_below_minimum);

CREATE INDEX idx_invoices_encounter_id ON invoices(encounter_id);
CREATE INDEX idx_invoices_patient_id ON invoices(patient_id);
CREATE INDEX idx_invoices_status ON invoices(status);

CREATE INDEX idx_ss_sync_logs_resource ON ss_sync_logs(resource_type, local_id);
CREATE INDEX idx_ss_sync_logs_status ON ss_sync_logs(status);

CREATE INDEX idx_practitioners_organization ON practitioners(organization_id);
CREATE INDEX idx_practitioners_user_id ON practitioners(user_id);
CREATE INDEX idx_practitioners_role ON practitioners(role);

CREATE INDEX idx_running_bills_episode ON running_bills(episode_of_care_id);
CREATE INDEX idx_running_bills_date ON running_bills(charge_date);


-- =============================================================================
-- SECTION 18: HELPER FUNCTIONS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organizations','locations','practitioners','patients','poli_services',
    'appointments','encounters','episodes_of_care','inpatient_admissions',
    'surgery_requests','medications','medication_stock','purchase_orders',
    'invoices','emergency_encounters','nutrition_orders','lab_orders'
  ]
  LOOP
    EXECUTE format('
      CREATE TRIGGER trg_updated_at_%s
      BEFORE UPDATE ON %s
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    ', t, t);
  END LOOP;
END $$;

-- Auto-generate queue number
CREATE OR REPLACE FUNCTION generate_queue_number(
  p_poli_service_id UUID,
  p_queue_date DATE,
  p_prefix TEXT DEFAULT 'A'
)
RETURNS TEXT AS $$
DECLARE
  v_seq INT;
  v_queue_number TEXT;
BEGIN
  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO v_seq
  FROM queues
  WHERE poli_service_id = p_poli_service_id
    AND queue_date = p_queue_date;

  v_queue_number := p_prefix || LPAD(v_seq::TEXT, 3, '0');
  RETURN v_queue_number;
END;
$$ LANGUAGE plpgsql;

-- Auto-generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number(p_org_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_count INT;
  v_inv_number TEXT;
BEGIN
  SELECT COUNT(*) + 1
  INTO v_count
  FROM invoices
  WHERE organization_id = p_org_id
    AND DATE_TRUNC('month', invoice_date) = DATE_TRUNC('month', NOW());

  v_inv_number := 'INV/' || TO_CHAR(NOW(), 'YYYY/MM') || '/' || LPAD(v_count::TEXT, 5, '0');
  RETURN v_inv_number;
END;
$$ LANGUAGE plpgsql;

-- Auto-generate medical record number
CREATE OR REPLACE FUNCTION generate_medical_record_no(p_org_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) + 1
  INTO v_count
  FROM patients;

  RETURN 'MR/' || TO_CHAR(NOW(), 'YYYY') || '/' || LPAD(v_count::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Deduct stock when medication is dispensed
CREATE OR REPLACE FUNCTION deduct_medication_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE medication_stock
  SET quantity = quantity - NEW.quantity_dispensed,
      updated_at = NOW()
  WHERE id = NEW.stock_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_deduct_stock_on_dispense
AFTER INSERT ON medication_dispenses
FOR EACH ROW EXECUTE FUNCTION deduct_medication_stock();

-- Add stock when PO item is received
CREATE OR REPLACE FUNCTION add_stock_on_po_receipt()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quantity_received > OLD.quantity_received AND NEW.quantity_received > 0 THEN
    INSERT INTO medication_stock (medication_id, organization_id, batch_number, expiry_date, quantity, unit_price)
    SELECT
      poi.medication_id,
      po.organization_id,
      NEW.batch_number,
      NEW.expiry_date,
      NEW.quantity_received - OLD.quantity_received,
      NEW.unit_price
    FROM purchase_order_items poi
    JOIN purchase_orders po ON poi.po_id = po.id
    WHERE poi.id = NEW.id
    ON CONFLICT (medication_id, batch_number)
    DO UPDATE SET
      quantity = medication_stock.quantity + EXCLUDED.quantity,
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_add_stock_on_po_receipt
AFTER UPDATE ON purchase_order_items
FOR EACH ROW EXECUTE FUNCTION add_stock_on_po_receipt();

-- Get current practitioner's role from JWT
CREATE OR REPLACE FUNCTION get_current_practitioner_role()
RETURNS user_role AS $$
DECLARE
  v_role user_role;
BEGIN
  SELECT role INTO v_role
  FROM practitioners
  WHERE user_id = auth.uid();
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get current practitioner's organization
CREATE OR REPLACE FUNCTION get_current_org_id()
RETURNS UUID AS $$
DECLARE
  v_org UUID;
BEGIN
  SELECT organization_id INTO v_org
  FROM practitioners
  WHERE user_id = auth.uid();
  -- Fallback: check if user is a patient
  IF v_org IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN v_org;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if current user is a patient
CREATE OR REPLACE FUNCTION get_current_patient_id()
RETURNS UUID AS $$
DECLARE
  v_patient_id UUID;
BEGIN
  SELECT id INTO v_patient_id
  FROM patients
  WHERE user_id = auth.uid();
  RETURN v_patient_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- SECTION 19: ROW LEVEL SECURITY (RLS)
-- =============================================================================
-- Strategy:
--   - Patients: can only see their own data
--   - Staff (practitioners): can see data within their organization
--   - Role-based write access: only specific roles can INSERT/UPDATE specific tables
--   - Admin: full access within their organization
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE practitioners ENABLE ROW LEVEL SECURITY;
ALTER TABLE practitioner_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE poli_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE queues ENABLE ROW LEVEL SECURITY;
ALTER TABLE encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes_of_care ENABLE ROW LEVEL SECURITY;
ALTER TABLE vital_signs ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergy_intolerances ENABLE ROW LEVEL SECURITY;
ALTER TABLE informed_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE inpatient_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inpatient_daily_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE surgery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_dispenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE running_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE ss_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------
-- ORGANIZATIONS
-- -----------------------------------------------
-- Staff see their org only
CREATE POLICY "org_select_staff" ON organizations
  FOR SELECT USING (
    id = get_current_org_id()
  );
-- Admin can update their org
CREATE POLICY "org_update_admin" ON organizations
  FOR UPDATE USING (
    id = get_current_org_id()
    AND get_current_practitioner_role() = 'admin'
  );

-- -----------------------------------------------
-- LOCATIONS
-- -----------------------------------------------
CREATE POLICY "locations_select_staff" ON locations
  FOR SELECT USING (organization_id = get_current_org_id());

CREATE POLICY "locations_write_admin" ON locations
  FOR ALL USING (
    organization_id = get_current_org_id()
    AND get_current_practitioner_role() = 'admin'
  );

-- -----------------------------------------------
-- PRACTITIONERS
-- -----------------------------------------------
-- Staff can see all practitioners in their org
CREATE POLICY "practitioners_select_staff" ON practitioners
  FOR SELECT USING (organization_id = get_current_org_id());

-- Staff can see their own record
CREATE POLICY "practitioners_select_self" ON practitioners
  FOR SELECT USING (user_id = auth.uid());

-- Admin manages practitioners
CREATE POLICY "practitioners_write_admin" ON practitioners
  FOR ALL USING (
    organization_id = get_current_org_id()
    AND get_current_practitioner_role() = 'admin'
  );

-- -----------------------------------------------
-- PATIENTS
-- -----------------------------------------------
-- Patients see only their own record
CREATE POLICY "patients_select_self" ON patients
  FOR SELECT USING (user_id = auth.uid());

-- Staff can see all patients in their org's encounters
CREATE POLICY "patients_select_staff" ON patients
  FOR SELECT USING (
    get_current_org_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM encounters e
      WHERE e.patient_id = patients.id
        AND e.organization_id = get_current_org_id()
    )
  );

-- Admin and nurse can register new patients
CREATE POLICY "patients_insert_staff" ON patients
  FOR INSERT WITH CHECK (
    get_current_practitioner_role() IN ('admin', 'nurse', 'doctor')
  );

-- Admin/nurse can update patients
CREATE POLICY "patients_update_staff" ON patients
  FOR UPDATE USING (
    get_current_practitioner_role() IN ('admin', 'nurse')
  );

-- -----------------------------------------------
-- POLI SERVICES
-- -----------------------------------------------
-- Public read: needed for online booking (patients can see poli list)
CREATE POLICY "poli_select_public" ON poli_services
  FOR SELECT USING (is_active = TRUE);

CREATE POLICY "poli_write_admin" ON poli_services
  FOR ALL USING (
    organization_id = get_current_org_id()
    AND get_current_practitioner_role() = 'admin'
  );

-- -----------------------------------------------
-- APPOINTMENT SLOTS
-- -----------------------------------------------
-- Public read: patients need to see available slots
CREATE POLICY "slots_select_public" ON appointment_slots
  FOR SELECT USING (is_available = TRUE);

CREATE POLICY "slots_write_admin" ON appointment_slots
  FOR ALL USING (
    get_current_practitioner_role() IN ('admin', 'nurse')
  );

-- -----------------------------------------------
-- APPOINTMENTS
-- -----------------------------------------------
-- Patient sees their own appointments
CREATE POLICY "appt_select_patient" ON appointments
  FOR SELECT USING (patient_id = get_current_patient_id());

-- Patient can create appointment
CREATE POLICY "appt_insert_patient" ON appointments
  FOR INSERT WITH CHECK (patient_id = get_current_patient_id());

-- Patient can cancel their appointment
CREATE POLICY "appt_cancel_patient" ON appointments
  FOR UPDATE USING (
    patient_id = get_current_patient_id()
    AND status = 'booked'
  );

-- Staff see all appointments in their org's poli
CREATE POLICY "appt_select_staff" ON appointments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM poli_services ps
      WHERE ps.id = appointments.poli_service_id
        AND ps.organization_id = get_current_org_id()
    )
  );

-- Nurse/admin can update appointment status (check-in, etc.)
CREATE POLICY "appt_update_staff" ON appointments
  FOR UPDATE USING (
    get_current_practitioner_role() IN ('admin', 'nurse')
    AND EXISTS (
      SELECT 1 FROM poli_services ps
      WHERE ps.id = appointments.poli_service_id
        AND ps.organization_id = get_current_org_id()
    )
  );

-- -----------------------------------------------
-- QUEUES
-- -----------------------------------------------
-- Patient sees their own queue
CREATE POLICY "queue_select_patient" ON queues
  FOR SELECT USING (patient_id = get_current_patient_id());

-- Public: queue display screen needs to read queues
-- (handled via a dedicated anon read policy scoped to today's date)
CREATE POLICY "queue_select_public_display" ON queues
  FOR SELECT USING (queue_date = CURRENT_DATE);

-- Staff manages queues
CREATE POLICY "queue_all_staff" ON queues
  FOR ALL USING (
    get_current_org_id() IS NOT NULL
  );

-- -----------------------------------------------
-- ENCOUNTERS
-- -----------------------------------------------
-- Patient sees their own encounters
CREATE POLICY "encounter_select_patient" ON encounters
  FOR SELECT USING (patient_id = get_current_patient_id());

-- Staff sees encounters in their org
CREATE POLICY "encounter_select_staff" ON encounters
  FOR SELECT USING (organization_id = get_current_org_id());

-- Nurse/admin creates encounters (check-in)
CREATE POLICY "encounter_insert_staff" ON encounters
  FOR INSERT WITH CHECK (
    organization_id = get_current_org_id()
    AND get_current_practitioner_role() IN ('admin', 'nurse', 'doctor')
  );

-- Doctor/nurse can update encounter
CREATE POLICY "encounter_update_staff" ON encounters
  FOR UPDATE USING (
    organization_id = get_current_org_id()
    AND get_current_practitioner_role() IN ('admin', 'nurse', 'doctor')
  );

-- -----------------------------------------------
-- CLINICAL DATA (vital signs, diagnoses, etc.)
-- Common pattern: patient sees own, staff sees org
-- -----------------------------------------------

-- VITAL SIGNS
CREATE POLICY "vs_select_patient" ON vital_signs
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "vs_select_staff" ON vital_signs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM encounters e WHERE e.id = vital_signs.encounter_id AND e.organization_id = get_current_org_id())
  );
CREATE POLICY "vs_insert_nurse" ON vital_signs
  FOR INSERT WITH CHECK (
    get_current_practitioner_role() IN ('nurse', 'doctor', 'admin')
  );

-- DIAGNOSES
CREATE POLICY "dx_select_patient" ON diagnoses
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "dx_select_staff" ON diagnoses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM encounters e WHERE e.id = diagnoses.encounter_id AND e.organization_id = get_current_org_id())
  );
CREATE POLICY "dx_write_doctor" ON diagnoses
  FOR ALL USING (
    get_current_practitioner_role() IN ('doctor', 'admin')
  );

-- PROCEDURES
CREATE POLICY "proc_select_patient" ON procedures
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "proc_select_staff" ON procedures
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM encounters e WHERE e.id = procedures.encounter_id AND e.organization_id = get_current_org_id())
  );
CREATE POLICY "proc_write_doctor" ON procedures
  FOR ALL USING (
    get_current_practitioner_role() IN ('doctor', 'admin')
  );

-- CLINICAL NOTES (CPPT)
CREATE POLICY "notes_select_patient" ON clinical_notes
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "notes_select_staff" ON clinical_notes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM encounters e WHERE e.id = clinical_notes.encounter_id AND e.organization_id = get_current_org_id())
  );
CREATE POLICY "notes_write_clinical_staff" ON clinical_notes
  FOR ALL USING (
    get_current_practitioner_role() IN ('doctor', 'nurse', 'nutritionist', 'lab_nurse', 'admin')
  );

-- ALLERGY INTOLERANCES
CREATE POLICY "allergy_select_patient" ON allergy_intolerances
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "allergy_select_staff" ON allergy_intolerances
  FOR SELECT USING (get_current_org_id() IS NOT NULL);
CREATE POLICY "allergy_write_clinical" ON allergy_intolerances
  FOR ALL USING (
    get_current_practitioner_role() IN ('doctor', 'nurse', 'admin')
  );

-- -----------------------------------------------
-- LAB ORDERS
-- -----------------------------------------------
CREATE POLICY "lab_select_patient" ON lab_orders
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "lab_select_staff" ON lab_orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM encounters e WHERE e.id = lab_orders.encounter_id AND e.organization_id = get_current_org_id())
  );
CREATE POLICY "lab_insert_doctor" ON lab_orders
  FOR INSERT WITH CHECK (
    get_current_practitioner_role() IN ('doctor', 'admin')
  );
CREATE POLICY "lab_update_lab_nurse" ON lab_orders
  FOR UPDATE USING (
    get_current_practitioner_role() IN ('lab_nurse', 'doctor', 'admin')
  );

CREATE POLICY "lab_items_select_patient" ON lab_order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM lab_orders lo WHERE lo.id = lab_order_items.lab_order_id AND lo.patient_id = get_current_patient_id())
  );
CREATE POLICY "lab_items_select_staff" ON lab_order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lab_orders lo
      JOIN encounters e ON lo.encounter_id = e.id
      WHERE lo.id = lab_order_items.lab_order_id
        AND e.organization_id = get_current_org_id()
    )
  );
CREATE POLICY "lab_items_write_lab_nurse" ON lab_order_items
  FOR ALL USING (
    get_current_practitioner_role() IN ('lab_nurse', 'doctor', 'admin')
  );

-- -----------------------------------------------
-- NUTRITION ORDERS
-- -----------------------------------------------
CREATE POLICY "nutri_select_patient" ON nutrition_orders
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "nutri_select_staff" ON nutrition_orders
  FOR SELECT USING (get_current_org_id() IS NOT NULL);
CREATE POLICY "nutri_write_nutritionist" ON nutrition_orders
  FOR ALL USING (
    get_current_practitioner_role() IN ('nutritionist', 'admin')
  );

-- -----------------------------------------------
-- PHARMACY
-- -----------------------------------------------
-- Medications - all staff can read
CREATE POLICY "meds_select_staff" ON medications
  FOR SELECT USING (organization_id = get_current_org_id());
CREATE POLICY "meds_write_pharmacist" ON medications
  FOR ALL USING (
    organization_id = get_current_org_id()
    AND get_current_practitioner_role() IN ('pharmacist', 'admin')
  );

-- Medication stock - pharmacist manages
CREATE POLICY "stock_select_staff" ON medication_stock
  FOR SELECT USING (organization_id = get_current_org_id());
CREATE POLICY "stock_write_pharmacist" ON medication_stock
  FOR ALL USING (
    organization_id = get_current_org_id()
    AND get_current_practitioner_role() IN ('pharmacist', 'admin')
  );

-- Prescriptions - doctor writes, pharmacist/patient can read
CREATE POLICY "rx_select_patient" ON prescriptions
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "rx_select_staff" ON prescriptions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM encounters e WHERE e.id = prescriptions.encounter_id AND e.organization_id = get_current_org_id())
  );
CREATE POLICY "rx_insert_doctor" ON prescriptions
  FOR INSERT WITH CHECK (
    get_current_practitioner_role() IN ('doctor', 'admin')
  );

CREATE POLICY "rx_items_select_patient" ON prescription_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM prescriptions p WHERE p.id = prescription_items.prescription_id AND p.patient_id = get_current_patient_id())
  );
CREATE POLICY "rx_items_select_staff" ON prescription_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM prescriptions p
      JOIN encounters e ON p.encounter_id = e.id
      WHERE p.id = prescription_items.prescription_id
        AND e.organization_id = get_current_org_id()
    )
  );
CREATE POLICY "rx_items_write_doctor" ON prescription_items
  FOR ALL USING (
    get_current_practitioner_role() IN ('doctor', 'admin')
  );

-- Medication dispenses - pharmacist only
CREATE POLICY "dispense_select_patient" ON medication_dispenses
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "dispense_select_staff" ON medication_dispenses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM encounters e WHERE e.id = medication_dispenses.encounter_id AND e.organization_id = get_current_org_id())
  );
CREATE POLICY "dispense_write_pharmacist" ON medication_dispenses
  FOR ALL USING (
    get_current_practitioner_role() IN ('pharmacist', 'admin')
  );

-- -----------------------------------------------
-- PURCHASE ORDERS
-- -----------------------------------------------
CREATE POLICY "po_select_staff" ON purchase_orders
  FOR SELECT USING (organization_id = get_current_org_id());
CREATE POLICY "po_insert_pharmacist" ON purchase_orders
  FOR INSERT WITH CHECK (
    organization_id = get_current_org_id()
    AND get_current_practitioner_role() IN ('pharmacist', 'admin')
  );
CREATE POLICY "po_update_admin" ON purchase_orders
  FOR UPDATE USING (
    organization_id = get_current_org_id()
    AND get_current_practitioner_role() IN ('pharmacist', 'admin')
  );

CREATE POLICY "vendors_select_staff" ON vendors
  FOR SELECT USING (organization_id = get_current_org_id());
CREATE POLICY "vendors_write_admin" ON vendors
  FOR ALL USING (
    organization_id = get_current_org_id()
    AND get_current_practitioner_role() IN ('pharmacist', 'admin')
  );

CREATE POLICY "po_items_select_staff" ON purchase_order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM purchase_orders po WHERE po.id = purchase_order_items.po_id AND po.organization_id = get_current_org_id())
  );
CREATE POLICY "po_items_write_pharmacist" ON purchase_order_items
  FOR ALL USING (
    get_current_practitioner_role() IN ('pharmacist', 'admin')
  );

-- -----------------------------------------------
-- INVOICES & BILLING
-- -----------------------------------------------
CREATE POLICY "invoice_select_patient" ON invoices
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "invoice_select_staff" ON invoices
  FOR SELECT USING (organization_id = get_current_org_id());
CREATE POLICY "invoice_write_cashier" ON invoices
  FOR ALL USING (
    organization_id = get_current_org_id()
    AND get_current_practitioner_role() IN ('cashier', 'admin', 'nurse')
  );

CREATE POLICY "inv_items_select_patient" ON invoice_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND i.patient_id = get_current_patient_id())
  );
CREATE POLICY "inv_items_select_staff" ON invoice_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND i.organization_id = get_current_org_id())
  );
CREATE POLICY "inv_items_write_cashier" ON invoice_items
  FOR ALL USING (
    get_current_practitioner_role() IN ('cashier', 'admin', 'nurse')
  );

-- Running bill - staff only
CREATE POLICY "runbill_select_staff" ON running_bills
  FOR SELECT USING (get_current_org_id() IS NOT NULL);
CREATE POLICY "runbill_write_staff" ON running_bills
  FOR INSERT WITH CHECK (get_current_org_id() IS NOT NULL);

-- -----------------------------------------------
-- SATU SEHAT SYNC LOGS
-- -----------------------------------------------
CREATE POLICY "sslog_select_admin" ON ss_sync_logs
  FOR SELECT USING (
    get_current_practitioner_role() = 'admin'
  );
CREATE POLICY "sslog_insert_system" ON ss_sync_logs
  FOR INSERT WITH CHECK (
    get_current_practitioner_role() IN ('admin', 'nurse', 'doctor', 'pharmacist')
  );

-- -----------------------------------------------
-- AUDIT LOGS - Admin read only
-- -----------------------------------------------
CREATE POLICY "audit_select_admin" ON audit_logs
  FOR SELECT USING (
    get_current_practitioner_role() = 'admin'
  );
CREATE POLICY "audit_insert_all" ON audit_logs
  FOR INSERT WITH CHECK (TRUE);  -- any authenticated user can insert audit entries

-- -----------------------------------------------
-- INPATIENT & SURGERY - clinical staff
-- -----------------------------------------------
CREATE POLICY "inpatient_select_patient" ON inpatient_admissions
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "inpatient_select_staff" ON inpatient_admissions
  FOR SELECT USING (get_current_org_id() IS NOT NULL);
CREATE POLICY "inpatient_write_nurse_doctor" ON inpatient_admissions
  FOR ALL USING (
    get_current_practitioner_role() IN ('nurse', 'doctor', 'admin')
  );

CREATE POLICY "eoc_select_patient" ON episodes_of_care
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "eoc_select_staff" ON episodes_of_care
  FOR SELECT USING (organization_id = get_current_org_id());
CREATE POLICY "eoc_write_nurse_doctor" ON episodes_of_care
  FOR ALL USING (
    organization_id = get_current_org_id()
    AND get_current_practitioner_role() IN ('nurse', 'doctor', 'admin')
  );

CREATE POLICY "surgery_select_patient" ON surgery_requests
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "surgery_select_staff" ON surgery_requests
  FOR SELECT USING (get_current_org_id() IS NOT NULL);
CREATE POLICY "surgery_write_doctor" ON surgery_requests
  FOR ALL USING (
    get_current_practitioner_role() IN ('doctor', 'admin')
  );

CREATE POLICY "igd_select_patient" ON emergency_encounters
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "igd_select_staff" ON emergency_encounters
  FOR SELECT USING (get_current_org_id() IS NOT NULL);
CREATE POLICY "igd_write_nurse_doctor" ON emergency_encounters
  FOR ALL USING (
    get_current_practitioner_role() IN ('nurse', 'doctor', 'admin')
  );

CREATE POLICY "daily_records_staff" ON inpatient_daily_records
  FOR ALL USING (get_current_org_id() IS NOT NULL);

CREATE POLICY "consents_select_patient" ON informed_consents
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "consents_select_staff" ON informed_consents
  FOR SELECT USING (get_current_org_id() IS NOT NULL);
CREATE POLICY "consents_write_nurse" ON informed_consents
  FOR ALL USING (
    get_current_practitioner_role() IN ('nurse', 'doctor', 'admin')
  );

CREATE POLICY "resume_select_patient" ON medical_resumes
  FOR SELECT USING (patient_id = get_current_patient_id());
CREATE POLICY "resume_select_staff" ON medical_resumes
  FOR SELECT USING (get_current_org_id() IS NOT NULL);
CREATE POLICY "resume_write_doctor" ON medical_resumes
  FOR ALL USING (
    get_current_practitioner_role() IN ('doctor', 'admin')
  );

CREATE POLICY "pr_roles_select_staff" ON practitioner_roles
  FOR SELECT USING (get_current_org_id() IS NOT NULL);
CREATE POLICY "pr_roles_write_admin" ON practitioner_roles
  FOR ALL USING (
    get_current_practitioner_role() = 'admin'
  );


-- =============================================================================
-- SECTION 20: SEED DATA (example org, required for FK constraints)
-- =============================================================================

-- You can uncomment and modify this to seed your first organization
/*
INSERT INTO organizations (id, name, type, address, phone, email)
VALUES (
  uuid_generate_v4(),
  'Puskesmas MKP Kelompok 6',
  'puskesmas',
  'Jl. Kesehatan No. 123, Kecamatan Sehat, Kabupaten Sejahtera',
  '(021) 1234-5678',
  'info@puskesmasmkp6.go.id'
);
*/


-- =============================================================================
-- DONE
-- Tables: 33 | RLS Policies: ~85 | Functions: 8 | Triggers: 20+
-- =============================================================================
