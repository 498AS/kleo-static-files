import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { createHash } from "crypto";
import { readdirSync, statSync, mkdirSync, rmSync, unlinkSync, existsSync } from "fs";
import { join, relative, dirname } from "path";
import {
  SiteSchema, CreateSiteSchema, UpdateSiteAuthSchema,
  FileSchema, UploadResultSchema,
  StatsSchema, SiteStatsSchema,
  ErrorSchema, SuccessSchema
} from "./schema";
import * as db from "./db";
import * as caddy from "./caddy";
import { safePath } from "./utils";

const app = new OpenAPIHono();

const SITES_ROOT = process.env.SF_SITES_ROOT || "./sites";
const PORT = parseInt(process.env.SF_PORT || "3000");
const MAX_FILE_SIZE = parseInt(process.env.SF_MAX_FILE_MB || "50") * 1024 * 1024;

// Ensure sites directory exists
mkdirSync(SITES_ROOT, { recursive: true });

// === Auth middleware ===
app.use("*", async (c, next) => {
  // Skip auth for openapi.json
  if (c.req.path === "/openapi.json") return next();

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing API key" }, 401);
  }

  const key = authHeader.slice(7);
  const hash = createHash("sha256").update(key).digest("hex");
  const apiKey = db.getApiKey.get(hash);

  if (!apiKey) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  return next();
});

// === Helper functions ===
function hashPassword(pass: string): string {
  // Use bcrypt-style hash for Caddy compatibility
  return Bun.password.hashSync(pass, { algorithm: "bcrypt", cost: 10 });
}

function getSitePath(name: string): string {
  return join(SITES_ROOT, name);
}

function getFilesRecursive(dir: string, base: string = ""): { name: string; path: string; size: number; modified: string }[] {
  if (!existsSync(dir)) return [];

  const files: { name: string; path: string; size: number; modified: string }[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = join(base, entry.name);

    if (entry.isDirectory()) {
      files.push(...getFilesRecursive(fullPath, relativePath));
    } else {
      const stat = statSync(fullPath);
      files.push({
        name: entry.name,
        path: relativePath,
        size: stat.size,
        modified: stat.mtime.toISOString(),
      });
    }
  }

  return files;
}

function getDirSize(dir: string): number {
  if (!existsSync(dir)) return 0;

  let size = 0;
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      size += getDirSize(fullPath);
    } else {
      size += statSync(fullPath).size;
    }
  }

  return size;
}

// === Routes ===

// List sites
app.openapi(
  createRoute({
    method: "get",
    path: "/sites",
    tags: ["sites"],
    summary: "List all sites",
    responses: {
      200: {
        description: "List of sites",
        content: { "application/json": { schema: z.array(SiteSchema) } },
      },
    },
  }),
  (c) => {
    const sites = db.getSites.all();
    return c.json(sites);
  }
);

// Create site
app.openapi(
  createRoute({
    method: "post",
    path: "/sites",
    tags: ["sites"],
    summary: "Create a new site",
    request: {
      body: { content: { "application/json": { schema: CreateSiteSchema } } },
    },
    responses: {
      201: {
        description: "Site created",
        content: { "application/json": { schema: SiteSchema } },
      },
      400: {
        description: "Invalid input",
        content: { "application/json": { schema: ErrorSchema } },
      },
      409: {
        description: "Site already exists",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const sitePath = getSitePath(body.name);

    // Check if site exists
    if (db.getSite.get(body.name)) {
      return c.json({ error: "Site already exists" }, 409);
    }

    // Create directory
    mkdirSync(sitePath, { recursive: true });

    // Hash password if auth provided
    let authUser: string | null = null;
    let authHash: string | null = null;
    if (body.auth) {
      authUser = body.auth.user;
      authHash = hashPassword(body.auth.pass);
    }

    // Add to Caddy
    try {
      await caddy.addSite(body.name, sitePath, authHash ? { user: authUser!, hash: authHash } : undefined);
    } catch (e: any) {
      // Clean up on failure
      rmSync(sitePath, { recursive: true, force: true });
      return c.json({ error: e.message }, 500);
    }

    // Insert into DB
    const site = db.insertSite.get(body.name, sitePath, authUser, authHash);
    return c.json(site, 201);
  }
);

// Delete site
app.openapi(
  createRoute({
    method: "delete",
    path: "/sites/{name}",
    tags: ["sites"],
    summary: "Delete a site",
    request: {
      params: z.object({ name: z.string() }),
    },
    responses: {
      200: {
        description: "Site deleted",
        content: { "application/json": { schema: SuccessSchema } },
      },
      404: {
        description: "Site not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    const { name } = c.req.valid("param");
    const site = db.getSite.get(name);

    if (!site) {
      return c.json({ error: "Site not found" }, 404);
    }

    // Remove from Caddy
    await caddy.removeSite(name);

    // Delete files
    rmSync(site.path, { recursive: true, force: true });

    // Delete from DB
    db.deleteSiteQuery.run(name);

    return c.json({ success: true, message: `Site ${name} deleted` });
  }
);

// Update site auth
app.openapi(
  createRoute({
    method: "patch",
    path: "/sites/{name}",
    tags: ["sites"],
    summary: "Update site authentication",
    request: {
      params: z.object({ name: z.string() }),
      body: { content: { "application/json": { schema: UpdateSiteAuthSchema } } },
    },
    responses: {
      200: {
        description: "Site updated",
        content: { "application/json": { schema: SiteSchema } },
      },
      404: {
        description: "Site not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    const { name } = c.req.valid("param");
    const body = c.req.valid("json");
    const site = db.getSite.get(name);

    if (!site) {
      return c.json({ error: "Site not found" }, 404);
    }

    let authUser: string | null = null;
    let authHash: string | null = null;
    if (body.auth) {
      authUser = body.auth.user;
      authHash = hashPassword(body.auth.pass);
    }

    // Update Caddy
    await caddy.updateSiteAuth(name, site.path, authHash ? { user: authUser!, hash: authHash } : null);

    // Update DB
    const updated = db.updateSiteAuth.get(authUser, authHash, name);
    return c.json(updated);
  }
);

// Upload file
app.openapi(
  createRoute({
    method: "post",
    path: "/sites/{name}/files",
    tags: ["files"],
    summary: "Upload a file to a site",
    request: {
      params: z.object({ name: z.string() }),
      query: z.object({
        path: z.string().optional().describe("Subdirectory path"),
        overwrite: z.string().optional().describe("Overwrite existing file"),
      }),
      body: {
        content: {
          "multipart/form-data": {
            schema: z.object({
              file: z.any().describe("File to upload"),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: "File uploaded",
        content: { "application/json": { schema: UploadResultSchema } },
      },
      404: {
        description: "Site not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
      409: {
        description: "File exists",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  async (c) => {
    const { name } = c.req.valid("param");
    const query = c.req.valid("query");
    const site = db.getSite.get(name);

    if (!site) {
      return c.json({ error: "Site not found" }, 404);
    }

    const formData = await c.req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    // Check file size limit
    if (file.size > MAX_FILE_SIZE) {
      return c.json({ error: `File too large. Max: ${MAX_FILE_SIZE / 1024 / 1024}MB` }, 413);
    }

    const subPath = query.path || "";
    const relativePath = join(subPath, file.name);

    // Validate path to prevent path traversal attacks
    const targetPath = safePath(site.path, relativePath);
    if (!targetPath) {
      return c.json({ error: "Invalid path" }, 400);
    }

    // Check if file exists
    if (existsSync(targetPath) && query.overwrite !== "true") {
      return c.json({ error: "File already exists. Use ?overwrite=true to replace" }, 409);
    }

    // Create directory if needed
    mkdirSync(dirname(targetPath), { recursive: true });

    // Write file
    const buffer = await file.arrayBuffer();
    await Bun.write(targetPath, buffer);

    return c.json({
      path: relativePath,
      size: file.size,
      url: `${caddy.getSiteUrl(name)}/${relativePath}`,
    }, 201);
  }
);

// List files
app.openapi(
  createRoute({
    method: "get",
    path: "/sites/{name}/files",
    tags: ["files"],
    summary: "List files in a site",
    request: {
      params: z.object({ name: z.string() }),
    },
    responses: {
      200: {
        description: "List of files",
        content: { "application/json": { schema: z.array(FileSchema) } },
      },
      404: {
        description: "Site not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  (c) => {
    const { name } = c.req.valid("param");
    const site = db.getSite.get(name);

    if (!site) {
      return c.json({ error: "Site not found" }, 404);
    }

    const files = getFilesRecursive(site.path);
    return c.json(files);
  }
);

// Delete file
app.openapi(
  createRoute({
    method: "delete",
    path: "/sites/{name}/files/{path}",
    tags: ["files"],
    summary: "Delete a file from a site",
    request: {
      params: z.object({
        name: z.string(),
        path: z.string(),
      }),
    },
    responses: {
      200: {
        description: "File deleted",
        content: { "application/json": { schema: SuccessSchema } },
      },
      404: {
        description: "File not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  (c) => {
    const { name, path: filePath } = c.req.valid("param");
    const site = db.getSite.get(name);

    if (!site) {
      return c.json({ error: "Site not found" }, 404);
    }

    // Validate path to prevent path traversal attacks
    const fullPath = safePath(site.path, filePath);
    if (!fullPath) {
      return c.json({ error: "Invalid path" }, 400);
    }

    if (!existsSync(fullPath)) {
      return c.json({ error: "File not found" }, 404);
    }

    unlinkSync(fullPath);
    return c.json({ success: true, message: `Deleted ${filePath}` });
  }
);

// Global stats
app.openapi(
  createRoute({
    method: "get",
    path: "/stats",
    tags: ["stats"],
    summary: "Get global statistics",
    responses: {
      200: {
        description: "Global statistics",
        content: { "application/json": { schema: StatsSchema } },
      },
    },
  }),
  (c) => {
    const stats = db.getGlobalStats.get();
    const sites = db.getSites.all();

    let totalFiles = 0;
    let totalSize = 0;

    for (const site of sites) {
      const files = getFilesRecursive(site.path);
      totalFiles += files.length;
      totalSize += getDirSize(site.path);
    }

    return c.json({
      total_sites: stats.total_sites,
      total_files: totalFiles,
      total_size: totalSize,
      total_requests: stats.total_requests,
    });
  }
);

// Site stats
app.openapi(
  createRoute({
    method: "get",
    path: "/stats/{name}",
    tags: ["stats"],
    summary: "Get statistics for a site",
    request: {
      params: z.object({ name: z.string() }),
    },
    responses: {
      200: {
        description: "Site statistics",
        content: { "application/json": { schema: SiteStatsSchema } },
      },
      404: {
        description: "Site not found",
        content: { "application/json": { schema: ErrorSchema } },
      },
    },
  }),
  (c) => {
    const { name } = c.req.valid("param");
    const site = db.getSite.get(name);

    if (!site) {
      return c.json({ error: "Site not found" }, 404);
    }

    const stats = db.getSiteStats.get(name);
    const files = getFilesRecursive(site.path);
    const size = getDirSize(site.path);
    const topPaths = db.getTopPaths.all(site.id, 10);

    return c.json({
      site: name,
      files: files.length,
      size,
      requests: stats?.requests || 0,
      recent_paths: topPaths,
    });
  }
);

// OpenAPI spec
app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Static Files API",
    version: "1.0.0",
    description: "API for managing static file hosting on subdomains",
  },
});

console.log(`Static Files server running on http://localhost:${PORT}`);
export default {
  port: PORT,
  fetch: app.fetch,
};
