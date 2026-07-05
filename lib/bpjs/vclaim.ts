export interface EligibilityResult {
  eligible: boolean
  bpjsNo: string
  name?: string
  memberClass?: string
  memberStatus?: string
  reason?: string
}

export interface VClaimClient {
  checkEligibility(bpjsNo: string, serviceDate: string): Promise<EligibilityResult>
}

/**
 * Mock until real VClaim credentials (BPJS_CONS_ID / BPJS_SECRET_KEY / BPJS_USER_KEY)
 * are provisioned. Deterministic rules so QA can exercise both paths:
 *   - must be 13 digits
 *   - numbers ending in "99" simulate an inactive member
 */
export class MockVClaimClient implements VClaimClient {
  async checkEligibility(bpjsNo: string, _serviceDate: string): Promise<EligibilityResult> {
    if (!/^\d{13}$/.test(bpjsNo)) {
      return { eligible: false, bpjsNo, reason: 'Nomor BPJS harus 13 digit' }
    }
    if (bpjsNo.endsWith('99')) {
      return { eligible: false, bpjsNo, memberStatus: 'NONAKTIF', reason: 'Peserta tidak aktif' }
    }
    return { eligible: true, bpjsNo, memberStatus: 'AKTIF', memberClass: '2', name: undefined }
  }
}

export function getVClaimClient(): VClaimClient {
  // When real creds land: if (process.env.BPJS_CONS_ID) return new RealVClaimClient(...)
  return new MockVClaimClient()
}
