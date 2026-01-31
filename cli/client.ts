import type { Site, CreateSite, UpdateSiteAuth, FileInfo, UploadResult, Stats, SiteStats } from "../server/schema";

const API_URL = process.env.SF_API_URL || "http://localhost:3000";
const API_KEY = process.env.SF_API_KEY || "";

/**
 * Validate that required configuration is present.
 * Called at CLI startup.
 */
export function validateConfig(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!process.env.SF_API_KEY) {
    errors.push("SF_API_KEY environment variable is required");
    errors.push("Set it with: export SF_API_KEY=sk_xxxxx");
  }

  if (!process.env.SF_API_URL) {
    warnings.push(`SF_API_URL not set, using default: ${API_URL}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        ...options.headers,
      },
    });
  } catch (e: any) {
    // Handle connection errors with friendly messages
    if (e.code === "ECONNREFUSED" || e.message?.includes("ECONNREFUSED")) {
      throw new Error(`Cannot connect to ${API_URL}. Is the server running?`);
    }
    if (e.code === "ENOTFOUND" || e.message?.includes("ENOTFOUND")) {
      throw new Error(`Cannot resolve ${API_URL}. Check SF_API_URL is correct.`);
    }
    if (e.code === "ETIMEDOUT" || e.message?.includes("timed out")) {
      throw new Error(`Connection to ${API_URL} timed out. Server may be overloaded.`);
    }
    if (e.name === "TypeError" && e.message?.includes("fetch")) {
      throw new Error(`Network error connecting to ${API_URL}: ${e.message}`);
    }
    throw e;
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    throw new Error(`Unexpected response format from server`);
  }

  if (!res.ok) {
    // Provide more context for common errors
    const msg = data.error || `HTTP ${res.status}`;
    
    if (res.status === 401) {
      throw new Error(`Authentication failed: ${msg}. Check your SF_API_KEY.`);
    }
    if (res.status === 403) {
      throw new Error(`Access denied: ${msg}`);
    }
    if (res.status === 404) {
      throw new Error(`Not found: ${msg}`);
    }
    if (res.status === 429) {
      const retryAfter = data.retryAfter || res.headers.get("Retry-After");
      throw new Error(`Rate limit exceeded. ${retryAfter ? `Try again in ${retryAfter}s.` : ""}`);
    }
    if (res.status === 413) {
      throw new Error(`Upload rejected: ${msg}`);
    }
    if (res.status >= 500) {
      throw new Error(`Server error (${res.status}): ${msg}`);
    }
    
    throw new Error(msg);
  }

  return data as T;
}

// === Sites ===
export async function listSites(): Promise<Site[]> {
  return request<Site[]>("/sites");
}

export async function createSite(name: string, auth?: { user: string; pass: string }): Promise<Site> {
  const body: CreateSite = { name };
  if (auth) body.auth = auth;

  return request<Site>("/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteSite(name: string): Promise<{ success: boolean; message?: string }> {
  return request(`/sites/${name}`, { method: "DELETE" });
}

export async function updateAuth(name: string, auth: { user: string; pass: string } | null): Promise<Site> {
  const body: UpdateSiteAuth = { auth };
  return request<Site>(`/sites/${name}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// === Files ===
export async function listFiles(site: string): Promise<FileInfo[]> {
  return request<FileInfo[]>(`/sites/${site}/files`);
}

export async function uploadFile(
  site: string,
  file: File,
  subPath?: string,
  overwrite?: boolean
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams();
  if (subPath) params.set("path", subPath);
  if (overwrite) params.set("overwrite", "true");

  const query = params.toString() ? `?${params}` : "";

  return request<UploadResult>(`/sites/${site}/files${query}`, {
    method: "POST",
    body: formData,
  });
}

export async function deleteFile(site: string, path: string): Promise<{ success: boolean; message?: string }> {
  return request(`/sites/${site}/files/${path}`, { method: "DELETE" });
}

// === Stats ===
export async function getStats(): Promise<Stats> {
  return request<Stats>("/stats");
}

export async function getSiteStats(site: string): Promise<SiteStats> {
  return request<SiteStats>(`/stats/${site}`);
}
