import { getAccessToken, invalidateToken } from './auth'
import { SS_FHIR_URL } from './config'

export interface FhirResult { ok: boolean; status: number; body: any }

export interface FhirClient {
  get(path: string): Promise<FhirResult>
  post(path: string, payload: unknown): Promise<FhirResult>
  put(path: string, payload: unknown): Promise<FhirResult>
}

async function request(method: 'GET' | 'POST' | 'PUT', path: string, payload?: unknown, retried = false): Promise<FhirResult> {
  const token = await getAccessToken()
  const res = await fetch(`${SS_FHIR_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
  })
  // one retry on stale token
  if (res.status === 401 && !retried) {
    await invalidateToken()
    return request(method, path, payload, true)
  }
  let body: any = null
  try { body = await res.json() } catch { /* non-JSON error body */ }
  return { ok: res.ok, status: res.status, body }
}

export const realFhirClient: FhirClient = {
  get: (path) => request('GET', path),
  post: (path, payload) => request('POST', path, payload),
  put: (path, payload) => request('PUT', path, payload),
}
