import { z } from "@hono/zod-openapi";

// === Sites ===
export const SiteSchema = z.object({
  id: z.number(),
  name: z.string().regex(/^[a-z0-9-]+$/, "lowercase alphanumeric and hyphens only"),
  path: z.string(),
  auth_user: z.string().nullable(),
  created_at: z.string(),
});

export const CreateSiteSchema = z.object({
  name: z.string().min(1).max(63).regex(/^[a-z0-9-]+$/, "lowercase alphanumeric and hyphens only"),
  auth: z.object({
    user: z.string().min(1),
    pass: z.string().min(8),
  }).optional(),
});

export const UpdateSiteAuthSchema = z.object({
  auth: z.object({
    user: z.string().min(1),
    pass: z.string().min(8),
  }).nullable(),
});

// === Files ===
export const FileSchema = z.object({
  name: z.string(),
  path: z.string(),
  size: z.number(),
  modified: z.string(),
});

export const UploadResultSchema = z.object({
  path: z.string(),
  size: z.number(),
  url: z.string(),
});

// === Stats ===
export const StatsSchema = z.object({
  total_sites: z.number(),
  total_files: z.number(),
  total_size: z.number(),
  total_requests: z.number(),
});

export const SiteStatsSchema = z.object({
  site: z.string(),
  files: z.number(),
  size: z.number(),
  requests: z.number(),
  recent_paths: z.array(z.object({
    path: z.string(),
    count: z.number(),
  })),
});

// === Common ===
export const ErrorSchema = z.object({
  error: z.string(),
});

export const SuccessSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

// === Health ===
export const HealthSchema = z.object({
  status: z.enum(["ok", "error"]),
  timestamp: z.string(),
  error: z.string().optional(),
});

// Types
export type Site = z.infer<typeof SiteSchema>;
export type CreateSite = z.infer<typeof CreateSiteSchema>;
export type UpdateSiteAuth = z.infer<typeof UpdateSiteAuthSchema>;
export type FileInfo = z.infer<typeof FileSchema>;
export type UploadResult = z.infer<typeof UploadResultSchema>;
export type Stats = z.infer<typeof StatsSchema>;
export type SiteStats = z.infer<typeof SiteStatsSchema>;
