-- Migration: Add episode_of_care_id column and unique constraints to invoices
-- Run in Supabase dashboard → SQL Editor
-- Date: 2026-06-15

-- 1. Add episode_of_care_id column (nullable — only set for inpatient episodes)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS episode_of_care_id UUID REFERENCES episodes_of_care(id) ON DELETE SET NULL;

-- 2. Partial unique index for OUTPATIENT invoices (encounter_id unique, no episode)
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_encounter
  ON invoices (encounter_id)
  WHERE episode_of_care_id IS NULL;

-- 3. Unique index for INPATIENT invoices (one invoice per episode)
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_episode
  ON invoices (episode_of_care_id)
  WHERE episode_of_care_id IS NOT NULL;

-- 4. Index for fast lookups by episode
CREATE INDEX IF NOT EXISTS idx_invoices_episode_of_care_id
  ON invoices (episode_of_care_id);
