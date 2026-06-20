-- Migration: room_rates table
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS room_rates (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  room_class       TEXT NOT NULL CHECK (room_class IN ('vip', 'kelas_1', 'kelas_2', 'kelas_3')),
  daily_rate       DECIMAL(12,2) NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, room_class)
);

-- Seed default rates (replace <YOUR_ORG_ID> with the actual organizations.id)
-- INSERT INTO room_rates (organization_id, room_class, daily_rate) VALUES
--   ('<YOUR_ORG_ID>', 'vip',     500000),
--   ('<YOUR_ORG_ID>', 'kelas_1', 350000),
--   ('<YOUR_ORG_ID>', 'kelas_2', 250000),
--   ('<YOUR_ORG_ID>', 'kelas_3', 150000)
-- ON CONFLICT (organization_id, room_class) DO NOTHING;
