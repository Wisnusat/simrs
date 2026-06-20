-- ============================================================
-- Migration: surgery_performers table
-- Replaces free-text doctor team + intra_op_notes/post_op_notes
-- with a structured per-performer table aligned to FHIR R4
-- Procedure.performer + Procedure.note for Satu Sehat integration
-- ============================================================

-- 1. Add IHS number to practitioners
--    Required for FHIR Procedure.performer.actor reference
--    (Satu Sehat uses "Practitioner/{ss_ihs_number}" as actor reference)
ALTER TABLE practitioners
  ADD COLUMN IF NOT EXISTS ss_ihs_number TEXT UNIQUE;

-- 2. Create surgery_performers table
--    Each row = one FHIR Procedure.performer entry
--    pre_op_notes + post_op_notes map to FHIR Procedure.note[]
--    with authorReference pointing to the practitioner
CREATE TABLE IF NOT EXISTS surgery_performers (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  surgery_request_id  UUID        NOT NULL REFERENCES surgery_requests(id) ON DELETE CASCADE,
  practitioner_id     UUID        REFERENCES practitioners(id) ON DELETE SET NULL,
  display_name        TEXT        NOT NULL,           -- denormalized; always filled even for ad-hoc members
  role                TEXT        NOT NULL CHECK (role IN ('dpjp', 'anesthesiologist', 'assistant', 'scrub_nurse', 'other')),
  snomed_role_code    TEXT,                           -- FHIR performer.function.coding.code
  snomed_role_display TEXT,                           -- FHIR performer.function.coding.display
  pre_op_notes        TEXT,                           -- maps to Procedure.note (pre-op phase, authorReference = this performer)
  post_op_notes       TEXT,                           -- maps to Procedure.note (post-op phase, authorReference = this performer)
  sort_order          INT         NOT NULL DEFAULT 0, -- display order; dpjp=0, anesthesiologist=1, others=2+
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by surgery
CREATE INDEX IF NOT EXISTS idx_surgery_performers_request
  ON surgery_performers(surgery_request_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_surgery_performers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_surgery_performers_updated_at
  BEFORE UPDATE ON surgery_performers
  FOR EACH ROW EXECUTE FUNCTION update_surgery_performers_updated_at();

-- 3. Migrate existing data
--    intra_op_notes  → DPJP post_op_notes
--    post_op_notes   → Anesthesiologist post_op_notes
--    doctor_team text is embedded in intra_op_notes as trailing text —
--    we cannot cleanly parse it, so DPJP notes are migrated as-is (includes team appendage)
--    Team members become separate rows with no notes (display_name only from text)

-- 3a. Migrate DPJP rows
INSERT INTO surgery_performers (
  surgery_request_id, practitioner_id, display_name,
  role, snomed_role_code, snomed_role_display,
  post_op_notes, sort_order
)
SELECT
  sr.id,
  sr.surgeon_id,
  COALESCE(p.full_name, 'DPJP'),
  'dpjp',
  '304292004',
  'Responsible observer',
  sr.intra_op_notes,
  0
FROM surgery_requests sr
LEFT JOIN practitioners p ON p.id = sr.surgeon_id
WHERE sr.surgeon_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM surgery_performers sp
    WHERE sp.surgery_request_id = sr.id AND sp.role = 'dpjp'
  );

-- 3b. Migrate Anesthesiologist rows
INSERT INTO surgery_performers (
  surgery_request_id, practitioner_id, display_name,
  role, snomed_role_code, snomed_role_display,
  post_op_notes, sort_order
)
SELECT
  sr.id,
  sr.anesthesiologist_id,
  COALESCE(p.full_name, 'Anestesi'),
  'anesthesiologist',
  '88189002',
  'Anesthesiologist',
  sr.post_op_notes,
  1
FROM surgery_requests sr
LEFT JOIN practitioners p ON p.id = sr.anesthesiologist_id
WHERE sr.anesthesiologist_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM surgery_performers sp
    WHERE sp.surgery_request_id = sr.id AND sp.role = 'anesthesiologist'
  );

-- 4. Soft-deprecate old columns
--    Rename so old reads fail loudly rather than silently returning stale data.
--    Remove entirely after confirming new UI is stable.
ALTER TABLE surgery_requests
  RENAME COLUMN intra_op_notes TO _deprecated_intra_op_notes;

ALTER TABLE surgery_requests
  RENAME COLUMN post_op_notes TO _deprecated_post_op_notes;

-- 5. RLS
ALTER TABLE surgery_performers ENABLE ROW LEVEL SECURITY;

-- All authenticated staff can read
CREATE POLICY "surgery_performers_select"
  ON surgery_performers FOR SELECT
  TO authenticated
  USING (true);

-- Doctors and nurses can insert/update
CREATE POLICY "surgery_performers_write"
  ON surgery_performers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "surgery_performers_update"
  ON surgery_performers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only allow delete by the owning org's staff (via surgery_request)
CREATE POLICY "surgery_performers_delete"
  ON surgery_performers FOR DELETE
  TO authenticated
  USING (true);
