import { describe, test, expect, beforeEach } from "bun:test";
import { clearRateLimits, getRateLimitStats, rateLimit } from "../server/middleware/rate-limit";
import type { Context, Next } from "hono";

// Mock context factory
function createMockContext(overrides: Partial<{
  authorization: string;
  forwardedFor: string;
  realIp: string;
}> = {}): Context {
  const headers: Record<string, string> = {};
  if (overrides.authorization) headers["authorization"] = overrides.authorization;
  if (overrides.forwardedFor) headers["x-forwarded-for"] = overrides.forwardedFor;
  if (overrides.realIp) headers["x-real-ip"] = overrides.realIp;

  const resHeaders = new Map<string, string>();

  return {
    req: {
      header: (name: string) => headers[name.toLowerCase()],
    },
    res: {
      headers: {
        set: (key: string, value: string) => resHeaders.set(key, value),
        get: (key: string) => resHeaders.get(key),
      },
    },
    json: (body: any, status?: number) => {
      return { body, status: status || 200 };
    },
  } as unknown as Context;
}

describe("rateLimit middleware", () => {
  beforeEach(() => {
    clearRateLimits();
  });

  test("allows requests under limit", async () => {
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 5 });
    const ctx = createMockContext({ authorization: "Bearer test-key" });
    let nextCalled = false;
    const next: Next = async () => { nextCalled = true; };

    const result = await middleware(ctx, next);

    expect(nextCalled).toBe(true);
    expect(result).toBeUndefined();
  });

  test("blocks requests over limit", async () => {
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 3 });
    const ctx = createMockContext({ authorization: "Bearer test-key" });
    const next: Next = async () => {};

    // First 3 should pass
    await middleware(ctx, next);
    await middleware(ctx, next);
    await middleware(ctx, next);

    // 4th should be blocked
    const result = await middleware(ctx, next) as any;
    
    expect(result).toBeDefined();
    expect(result.status).toBe(429);
    expect(result.body.error).toBe("Rate limit exceeded");
  });

  test("tracks different keys separately", async () => {
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 2 });
    
    const ctx1 = createMockContext({ authorization: "Bearer key-1" });
    const ctx2 = createMockContext({ authorization: "Bearer key-2" });
    const next: Next = async () => {};

    // 2 requests for key-1
    await middleware(ctx1, next);
    await middleware(ctx1, next);

    // key-1 is now at limit, but key-2 should still work
    const result1 = await middleware(ctx1, next) as any;
    expect(result1?.status).toBe(429);

    const result2 = await middleware(ctx2, next);
    expect(result2).toBeUndefined(); // Should pass
  });

  test("falls back to IP when no auth header", async () => {
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 2 });
    
    const ctx = createMockContext({ forwardedFor: "192.168.1.1" });
    const next: Next = async () => {};

    await middleware(ctx, next);
    await middleware(ctx, next);

    const result = await middleware(ctx, next) as any;
    expect(result?.status).toBe(429);
  });

  test("sets rate limit headers", async () => {
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 10 });
    const ctx = createMockContext({ authorization: "Bearer test" });
    const next: Next = async () => {};

    await middleware(ctx, next);

    expect(ctx.res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(ctx.res.headers.get("X-RateLimit-Remaining")).toBe("9");
    expect(ctx.res.headers.get("X-RateLimit-Reset")).toBeDefined();
  });

  test("getRateLimitStats returns correct counts", async () => {
    clearRateLimits();
    
    const middleware = rateLimit({ windowMs: 60000, maxRequests: 100 });
    const next: Next = async () => {};

    const ctx1 = createMockContext({ authorization: "Bearer key-a" });
    const ctx2 = createMockContext({ authorization: "Bearer key-b" });

    await middleware(ctx1, next);
    await middleware(ctx1, next);
    await middleware(ctx2, next);

    const stats = getRateLimitStats();
    expect(stats.keys).toBe(2);
    expect(stats.totalRequests).toBe(3);
  });
});
