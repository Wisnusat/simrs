import { NextRequest } from 'next/server'

export interface RateLimitConfig {
  /** Max requests allowed within the window */
  limit: number
  /** Window duration in seconds */
  windowSec: number
  /**
   * Use Upstash Redis for distributed rate limiting across instances.
   * Set true only for endpoints where cross-instance enforcement matters
   * (auth brute-force, write mutations). Read endpoints can use in-memory.
   */
  distributed?: boolean
}

export interface RateLimitResult {
  allowed: boolean
  /** Seconds until the window resets (only meaningful when !allowed) */
  retryAfter: number
  remaining: number
}

// ---------------------------------------------------------------------------
// In-memory fallback (development / single-instance deployments)
// WARNING: NOT shared across Vercel instances — rate limits are per-instance.
// ---------------------------------------------------------------------------

interface WindowEntry {
  count: number
  windowStart: number
}

const store = new Map<string, WindowEntry>()

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store.entries()) {
      if (now - entry.windowStart > CLEANUP_INTERVAL_MS) store.delete(key)
    }
  }, CLEANUP_INTERVAL_MS)
}

function rateLimitInMemory(
  ip: string,
  key: string,
  limit: number,
  windowSec: number
): RateLimitResult {
  const windowMs = windowSec * 1000
  const now = Date.now()
  const storeKey = `${ip}:${key}`
  const entry = store.get(storeKey)

  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(storeKey, { count: 1, windowStart: now })
    return { allowed: true, retryAfter: 0, remaining: limit - 1 }
  }

  entry.count++
  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000)
    return { allowed: false, retryAfter, remaining: 0 }
  }
  return { allowed: true, retryAfter: 0, remaining: limit - entry.count }
}

// ---------------------------------------------------------------------------
// Upstash Redis path (production — shared across all instances)
// Requires: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in .env.local
// Setup: https://console.upstash.com → create Redis DB → copy REST URL + token
// ---------------------------------------------------------------------------

async function rateLimitUpstash(
  ip: string,
  key: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  try {
    const { Ratelimit } = await import('@upstash/ratelimit')
    const { Redis } = await import('@upstash/redis')

    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })

    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: `simrs:rl:${key}`,
    })

    const { success, remaining, reset } = await rl.limit(`${ip}:${key}`)
    const retryAfter = success ? 0 : Math.ceil((reset - Date.now()) / 1000)
    return { allowed: success, retryAfter, remaining }
  } catch {
    // Upstash unavailable — fall back to in-memory for this request
    return rateLimitInMemory(ip, key, limit, windowSec)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Distributed rate limiter.
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL/TOKEN are configured (production).
 * Falls back to per-instance in-memory store (development/single-instance).
 *
 * Always returns a Promise — callers must `await rateLimit(...)`.
 */
export async function rateLimit(
  request: NextRequest,
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  // x-real-ip is set by Vercel/Cloudflare infrastructure and cannot be spoofed by clients.
  // Avoid x-forwarded-for[0] (leftmost) — clients can prepend arbitrary IPs to that header.
  const xfwdFor = request.headers.get('x-forwarded-for')
  const ip =
    request.headers.get('x-real-ip') ??
    (xfwdFor ? xfwdFor.split(',').at(-1)?.trim() : undefined) ??
    'unknown'

  if (
    config.distributed &&
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return rateLimitUpstash(ip, key, config.limit, config.windowSec)
  }

  return rateLimitInMemory(ip, key, config.limit, config.windowSec)
}

// ---------------------------------------------------------------------------
// Pre-configured rate limit configs
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
  /** Brute-force protection for login — distributed, wajib Redis */
  auth: { limit: 10, windowSec: 60, distributed: true } satisfies RateLimitConfig,
  /** General read endpoints — in-memory cukup, hemat Redis quota */
  read: { limit: 60, windowSec: 60, distributed: false } satisfies RateLimitConfig,
  /** Write / mutation endpoints — in-memory cukup, auth guard sudah proteksi utama */
  write: { limit: 20, windowSec: 60, distributed: false } satisfies RateLimitConfig,
}
