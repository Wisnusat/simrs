import { Redis } from '@upstash/redis'
import { SS_AUTH_URL, ssConfig } from './config'

const TOKEN_KEY = 'satusehat:access_token'
let mem: { token: string; expiresAt: number } | null = null

function redis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now()
  if (mem && mem.expiresAt > now) return mem.token

  const r = redis()
  const cached = await r.get<string>(TOKEN_KEY)
  if (cached) {
    mem = { token: cached, expiresAt: now + 30_000 } // trust redis TTL, re-check in 30s
    return cached
  }

  const { clientId, clientSecret } = ssConfig()
  const res = await fetch(SS_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
  })
  if (!res.ok) {
    throw new Error(`SATUSEHAT auth failed ${res.status}: ${await res.text()}`)
  }
  const json = await res.json()
  const token = json.access_token as string
  // expires_in ≈ 3599s; refresh 2 min early. Failed auths are rate-penalized, so cache hard.
  const ttl = Math.max(Number(json.expires_in ?? 3599) - 120, 60)
  await r.set(TOKEN_KEY, token, { ex: ttl })
  mem = { token, expiresAt: now + ttl * 1000 }
  return token
}

export async function invalidateToken(): Promise<void> {
  mem = null
  await redis().del(TOKEN_KEY)
}
