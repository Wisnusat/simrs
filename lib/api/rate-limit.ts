import { NextRequest } from 'next/server'

interface WindowEntry {
    count: number
    windowStart: number
}

// Module-level store — persists across requests within the same server instance.
// Key: "<ip>:<endpoint_key>"
const store = new Map<string, WindowEntry>()

// Clean up stale entries every 5 minutes to avoid unbounded memory growth.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now()
        for (const [key, entry] of store.entries()) {
            // Remove entries whose window expired more than 5 min ago
            if (now - entry.windowStart > CLEANUP_INTERVAL_MS) {
                store.delete(key)
            }
        }
    }, CLEANUP_INTERVAL_MS)
}

export interface RateLimitConfig {
    /** Max requests allowed within the window */
    limit: number
    /** Window duration in seconds */
    windowSec: number
}

export interface RateLimitResult {
    allowed: boolean
    /** Seconds until the window resets (only meaningful when !allowed) */
    retryAfter: number
    remaining: number
}

/**
 * Sliding-window in-memory rate limiter.
 *
 * @param request   - The incoming NextRequest (used to extract the client IP)
 * @param key       - A unique string for this endpoint group e.g. "auth:login"
 * @param config    - limit + windowSec
 */
export function rateLimit(
    request: NextRequest,
    key: string,
    config: RateLimitConfig
): RateLimitResult {
    const { limit, windowSec } = config
    const windowMs = windowSec * 1000
    const now = Date.now()

    // Resolve client IP (works behind Vercel / Nginx proxies)
    const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
        request.headers.get('x-real-ip') ??
        'unknown'

    const storeKey = `${ip}:${key}`
    const entry = store.get(storeKey)

    if (!entry || now - entry.windowStart >= windowMs) {
        // New window
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
// Pre-configured rate limit configs
// ---------------------------------------------------------------------------

export const RATE_LIMITS = {
    /** Brute-force protection for login */
    auth: { limit: 10, windowSec: 60 } satisfies RateLimitConfig,
    /** General read endpoints */
    read: { limit: 60, windowSec: 60 } satisfies RateLimitConfig,
    /** Write / mutation endpoints */
    write: { limit: 20, windowSec: 60 } satisfies RateLimitConfig,
}
