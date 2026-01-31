import type { Context, Next } from "hono";

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
}

// In-memory store for rate limiting
// Key: identifier (API key or IP), Value: array of timestamps
const requests = new Map<string, number[]>();

// Cleanup old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const windowMs = parseInt(process.env.SF_RATE_LIMIT_WINDOW || "60000");
  
  for (const [key, timestamps] of requests.entries()) {
    const recent = timestamps.filter(t => now - t < windowMs);
    if (recent.length === 0) {
      requests.delete(key);
    } else {
      requests.set(key, recent);
    }
  }
}, 5 * 60 * 1000);

/**
 * Rate limiting middleware.
 * Uses API key as identifier if present, otherwise falls back to IP.
 * 
 * Configure via env vars:
 * - SF_RATE_LIMIT_WINDOW: Time window in ms (default: 60000 = 1 minute)
 * - SF_RATE_LIMIT_MAX: Max requests per window (default: 100)
 */
export function rateLimit(config?: Partial<RateLimitConfig>) {
  const windowMs = config?.windowMs || parseInt(process.env.SF_RATE_LIMIT_WINDOW || "60000");
  const maxRequests = config?.maxRequests || parseInt(process.env.SF_RATE_LIMIT_MAX || "100");

  return async (c: Context, next: Next) => {
    // Use API key as primary identifier, fall back to IP
    const authHeader = c.req.header("Authorization");
    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip") || "unknown";
    const key = authHeader || ip;

    const now = Date.now();
    const timestamps = requests.get(key) || [];
    const recent = timestamps.filter(t => now - t < windowMs);

    if (recent.length >= maxRequests) {
      const resetTime = Math.ceil((recent[0] + windowMs - now) / 1000);
      
      c.res.headers.set("X-RateLimit-Limit", maxRequests.toString());
      c.res.headers.set("X-RateLimit-Remaining", "0");
      c.res.headers.set("X-RateLimit-Reset", resetTime.toString());
      c.res.headers.set("Retry-After", resetTime.toString());

      return c.json({
        error: "Rate limit exceeded",
        retryAfter: resetTime,
      }, 429);
    }

    recent.push(now);
    requests.set(key, recent);

    // Set rate limit headers
    c.res.headers.set("X-RateLimit-Limit", maxRequests.toString());
    c.res.headers.set("X-RateLimit-Remaining", (maxRequests - recent.length).toString());
    c.res.headers.set("X-RateLimit-Reset", Math.ceil(windowMs / 1000).toString());

    await next();
  };
}

/**
 * Get current rate limit stats (for testing/debugging)
 */
export function getRateLimitStats(): { keys: number; totalRequests: number } {
  let totalRequests = 0;
  for (const timestamps of requests.values()) {
    totalRequests += timestamps.length;
  }
  return { keys: requests.size, totalRequests };
}

/**
 * Clear rate limit data (for testing)
 */
export function clearRateLimits(): void {
  requests.clear();
}
