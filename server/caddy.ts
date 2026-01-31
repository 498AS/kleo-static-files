/**
 * Caddy integration module.
 * 
 * Uses sync-caddy.ts script to generate Caddyfile snippets for persistence.
 * Falls back to Admin API for environments without the script.
 */

import { $ } from "bun";
import { existsSync } from "fs";
import { join, dirname } from "path";

const CADDY_ADMIN = process.env.CADDY_ADMIN_URL || "http://localhost:2019";
const DOMAIN = process.env.SF_DOMAIN || "498as.com";
const SCRIPT_PATH = join(dirname(import.meta.dir), "scripts", "sync-caddy.ts");

// Check if we can use the sync script (preferred method)
const USE_SYNC_SCRIPT = existsSync(SCRIPT_PATH);

/**
 * Sync all sites to Caddy configuration.
 * This is the primary method - regenerates config from DB and reloads Caddy.
 */
export async function syncCaddy(): Promise<void> {
  if (!USE_SYNC_SCRIPT) {
    console.log("sync-caddy.ts not found, using Admin API");
    return;
  }

  try {
    // Use full path to bun since systemd might not have it in PATH
    const bunPath = process.execPath;
    const scriptDir = dirname(SCRIPT_PATH);
    await $`${bunPath} run ${SCRIPT_PATH} --reload`.cwd(dirname(scriptDir)).quiet();
  } catch (e: any) {
    console.error("Failed to sync Caddy:", e.message);
    console.error("Script path:", SCRIPT_PATH);
    throw new Error(`Caddy sync failed: ${e.message}`);
  }
}

/**
 * Add a site to Caddy.
 * Triggers full sync for persistence.
 */
export async function addSite(
  name: string, 
  fsPath: string, 
  auth?: { user: string; hash: string }
): Promise<void> {
  // For sync-based approach, we just need to sync after DB is updated
  // The caller should call syncCaddy() after updating the DB
  
  if (!USE_SYNC_SCRIPT) {
    // Fallback to Admin API (non-persistent)
    await addSiteViaApi(name, fsPath, auth);
  }
}

/**
 * Remove a site from Caddy.
 * Triggers full sync for persistence.
 */
export async function removeSite(name: string): Promise<void> {
  if (!USE_SYNC_SCRIPT) {
    // Fallback to Admin API
    await removeSiteViaApi(name);
  }
}

/**
 * Update site authentication.
 * Triggers full sync for persistence.
 */
export async function updateSiteAuth(
  name: string, 
  fsPath: string, 
  auth: { user: string; hash: string } | null
): Promise<void> {
  if (!USE_SYNC_SCRIPT) {
    // Fallback: remove and re-add
    await removeSiteViaApi(name);
    await addSiteViaApi(name, fsPath, auth || undefined);
  }
}

/**
 * Get the public URL for a site.
 */
export function getSiteUrl(name: string): string {
  return `https://${name}.${DOMAIN}`;
}

// === Admin API fallback (non-persistent) ===

interface CaddyRoute {
  "@id": string;
  match: { host: string[] }[];
  handle: any[];
}

async function addSiteViaApi(
  name: string, 
  fsPath: string, 
  auth?: { user: string; hash: string }
): Promise<void> {
  const route: CaddyRoute = {
    "@id": `sf-${name}`,
    match: [{ host: [`${name}.${DOMAIN}`] }],
    handle: [],
  };

  if (auth) {
    route.handle.push({
      handler: "authentication",
      providers: {
        http_basic: {
          accounts: [{ username: auth.user, password: auth.hash }],
        },
      },
    });
  }

  route.handle.push({
    handler: "file_server",
    root: fsPath,
  });

  const res = await fetch(`${CADDY_ADMIN}/config/apps/http/servers/srv0/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(route),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Caddy API error: ${text}`);
  }
}

async function removeSiteViaApi(name: string): Promise<void> {
  const res = await fetch(`${CADDY_ADMIN}/id/sf-${name}`, {
    method: "DELETE",
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Caddy API error: ${text}`);
  }
}
