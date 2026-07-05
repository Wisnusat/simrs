import { describe, it, expect } from 'vitest'
import { MockVClaimClient } from '@/lib/bpjs/vclaim'

describe('MockVClaimClient', () => {
  const client = new MockVClaimClient()
  it('accepts a valid 13-digit card number', async () => {
    const r = await client.checkEligibility('0001234567890', '2026-07-02')
    expect(r.eligible).toBe(true)
    expect(r.memberStatus).toBe('AKTIF')
    expect(r.bpjsNo).toBe('0001234567890')
  })
  it('rejects malformed numbers', async () => {
    const r = await client.checkEligibility('12345', '2026-07-02')
    expect(r.eligible).toBe(false)
    expect(r.reason).toContain('13 digit')
  })
  it('simulates inactive members (numbers ending in 99)', async () => {
    const r = await client.checkEligibility('0001234567899', '2026-07-02')
    expect(r.eligible).toBe(false)
    expect(r.memberStatus).toBe('NONAKTIF')
  })
})
