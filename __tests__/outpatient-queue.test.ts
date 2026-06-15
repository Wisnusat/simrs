/**
 * Unit tests — Queue business logic (rawat jalan)
 * Tier 2: validasi status transitions dan response shape
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Status transition rules (mirrored from route.ts)
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['waiting', 'called', 'in_service', 'done', 'skipped'] as const
type QueueStatus = typeof VALID_STATUSES[number]

function getTimestampFields(status: QueueStatus, practitionerId: string) {
  return {
    status,
    ...(status === 'called' ? { called_at: new Date().toISOString(), called_by: practitionerId } : {}),
    ...(status === 'in_service' ? { served_at: new Date().toISOString() } : {}),
    ...(status === 'done' || status === 'skipped' ? { done_at: new Date().toISOString() } : {}),
  }
}

describe('Queue — validasi status & timestamp fields', () => {
  const PRACTITIONER_ID = 'pract-001'

  it('Status "called" harus menyertakan called_at dan called_by', () => {
    const fields = getTimestampFields('called', PRACTITIONER_ID)
    expect(fields).toHaveProperty('called_at')
    expect(fields).toHaveProperty('called_by', PRACTITIONER_ID)
    expect(fields).not.toHaveProperty('served_at')
    expect(fields).not.toHaveProperty('done_at')
  })

  it('Status "in_service" harus menyertakan served_at', () => {
    const fields = getTimestampFields('in_service', PRACTITIONER_ID)
    expect(fields).toHaveProperty('served_at')
    expect(fields).not.toHaveProperty('called_at')
    expect(fields).not.toHaveProperty('done_at')
  })

  it('Status "done" harus menyertakan done_at', () => {
    const fields = getTimestampFields('done', PRACTITIONER_ID)
    expect(fields).toHaveProperty('done_at')
    expect(fields).not.toHaveProperty('called_at')
    expect(fields).not.toHaveProperty('served_at')
  })

  it('Status "skipped" harus menyertakan done_at', () => {
    const fields = getTimestampFields('skipped', PRACTITIONER_ID)
    expect(fields).toHaveProperty('done_at')
  })

  it('Status "waiting" tidak menyertakan timestamp tambahan', () => {
    const fields = getTimestampFields('waiting', PRACTITIONER_ID)
    expect(fields).not.toHaveProperty('called_at')
    expect(fields).not.toHaveProperty('served_at')
    expect(fields).not.toHaveProperty('done_at')
  })
})

describe('Queue — validasi input', () => {
  it('Status selain valid ditolak', () => {
    const invalid = ['pending', 'active', 'cancelled', '', 'DONE']
    for (const s of invalid) {
      expect(VALID_STATUSES.includes(s as QueueStatus)).toBe(false)
    }
  })

  it('Semua status valid diterima', () => {
    for (const s of VALID_STATUSES) {
      expect(VALID_STATUSES.includes(s)).toBe(true)
    }
  })
})
