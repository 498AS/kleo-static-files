import type { Site, CreateSite, UpdateSiteAuth, FileInfo, UploadResult, Stats, SiteStats } from "../server/schema";

const API_URL = process.env.SF_API_URL || "http://localhost:3000";
const API_KEY = process.env.SF_API_KEY || "";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      ...options.headers,
    },
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
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
