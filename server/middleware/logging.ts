import type { Context, Next } from "hono";

interface LogEntry {
  level: "info" | "warn" | "error";
  method: string;
  path: string;
  status: number;
  duration: number;
  timestamp: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Logging middleware that outputs JSON logs to stdout.
 * Designed for journald/systemd consumption.
 */
export function logging() {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    
    await next();
    
    const duration = Date.now() - start;
    const status = c.res.status;
    
    const entry: LogEntry = {
      level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      method: c.req.method,
      path: c.req.path,
      status,
      duration,
      timestamp: new Date().toISOString(),
    };
    
    // Add optional fields if available
    const ip = c.req.header("x-forwarded-for") || c.req.header("x-real-ip");
    if (ip) entry.ip = ip;
    
    const userAgent = c.req.header("user-agent");
    if (userAgent) entry.userAgent = userAgent;
    
    console.log(JSON.stringify(entry));
  };
}
