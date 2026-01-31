import { Database } from "bun:sqlite";

const DB_PATH = process.env.SF_DB_PATH || "./data/static-files.db";

// Ensure data directory exists
import { mkdirSync } from "fs";
import { dirname } from "path";
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);

// Initialize schema
db.run(`
  CREATE TABLE IF NOT EXISTS sites (
    id INTEGER PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    path TEXT NOT NULL,
    auth_user TEXT,
    auth_hash TEXT,
    quota_bytes INTEGER DEFAULT 104857600,  -- 100MB default
    used_bytes INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration: Add quota columns if they don't exist (for existing DBs)
try {
  db.run(`ALTER TABLE sites ADD COLUMN quota_bytes INTEGER DEFAULT 104857600`);
} catch (e) {
  // Column already exists, ignore
}
try {
  db.run(`ALTER TABLE sites ADD COLUMN used_bytes INTEGER DEFAULT 0`);
} catch (e) {
  // Column already exists, ignore
}

db.run(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY,
    key_hash TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS access_log (
    id INTEGER PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id),
    ip TEXT,
    path TEXT,
    status INTEGER,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`CREATE INDEX IF NOT EXISTS idx_access_log_site ON access_log(site_id)`);
db.run(`CREATE INDEX IF NOT EXISTS idx_access_log_timestamp ON access_log(timestamp)`);

// === Site queries ===
export const getSites = db.query<any, []>(`SELECT id, name, path, auth_user, created_at FROM sites ORDER BY created_at DESC`);

export const getSite = db.query<any, [string]>(`SELECT * FROM sites WHERE name = ?`);

export const insertSite = db.query<any, [string, string, string | null, string | null]>(
  `INSERT INTO sites (name, path, auth_user, auth_hash) VALUES (?, ?, ?, ?) RETURNING id, name, path, auth_user, created_at`
);

export const updateSiteAuth = db.query<any, [string | null, string | null, string]>(
  `UPDATE sites SET auth_user = ?, auth_hash = ? WHERE name = ? RETURNING id, name, path, auth_user, created_at`
);

export const deleteSiteQuery = db.query<any, [string]>(`DELETE FROM sites WHERE name = ?`);

// === Quota queries ===
export const updateUsedBytes = db.query<any, [number, string]>(
  `UPDATE sites SET used_bytes = ? WHERE name = ?`
);

export const incrementUsedBytes = db.query<any, [number, string]>(
  `UPDATE sites SET used_bytes = used_bytes + ? WHERE name = ?`
);

export const decrementUsedBytes = db.query<any, [number, string]>(
  `UPDATE sites SET used_bytes = MAX(0, used_bytes - ?) WHERE name = ?`
);

export const getSiteQuota = db.query<{ quota_bytes: number; used_bytes: number } | null, [string]>(
  `SELECT quota_bytes, used_bytes FROM sites WHERE name = ?`
);

// === API Key queries ===
export const getApiKey = db.query<any, [string]>(`SELECT * FROM api_keys WHERE key_hash = ?`);

export const insertApiKey = db.query<any, [string, string]>(
  `INSERT INTO api_keys (key_hash, name) VALUES (?, ?) RETURNING id, name, created_at`
);

// === Access log queries ===
export const logAccess = db.query<any, [number, string, string, number]>(
  `INSERT INTO access_log (site_id, ip, path, status) VALUES (?, ?, ?, ?)`
);

export const getGlobalStats = db.query<any, []>(`
  SELECT
    (SELECT COUNT(*) FROM sites) as total_sites,
    (SELECT COUNT(*) FROM access_log) as total_requests
`);

export const getSiteStats = db.query<any, [string]>(`
  SELECT
    s.name as site,
    COUNT(a.id) as requests
  FROM sites s
  LEFT JOIN access_log a ON a.site_id = s.id
  WHERE s.name = ?
  GROUP BY s.id
`);

export const getTopPaths = db.query<any, [number, number]>(`
  SELECT path, COUNT(*) as count
  FROM access_log
  WHERE site_id = ?
  GROUP BY path
  ORDER BY count DESC
  LIMIT ?
`);
