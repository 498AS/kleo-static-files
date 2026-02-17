import * as client from "./client";
import { DOMAIN } from "./client";
import { SITES_HELP, UPLOAD_HELP, FILES_HELP, STATS_HELP, DOCTOR_HELP } from "./help";
import { statSync, readdirSync } from "fs";
import { join, basename } from "path";

interface Options {
  json?: boolean;
  overwrite?: boolean;
  remove?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function output(data: any, opts: Options) {
  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// === Sites ===
export async function sites(args: string[], opts: Options) {
  const [action, ...rest] = args;

  if (!action || action === "list") {
    const sites = await client.listSites();

    if (opts.json) return output(sites, opts);

    if (sites.length === 0) {
      console.log("No sites found. Create one with: sf sites create <name>");
      return;
    }

    console.log("Sites:\n");
    for (const site of sites) {
      const auth = site.auth_user ? ` (auth: ${site.auth_user})` : "";
      console.log(`  ${site.name}.${DOMAIN}${auth}`);
      console.log(`    Created: ${formatDate(site.created_at)}\n`);
    }
    return;
  }

  if (action === "create") {
    const name = rest[0];
    if (!name) {
      console.error("Usage: sf sites create <name>");
      process.exit(1);
    }

    const site = await client.createSite(name);

    if (opts.json) return output(site, opts);

    console.log(`Created site: ${site.name}.${DOMAIN}`);
    console.log(`\nUpload files with: sf upload <file> ${site.name}`);
    return;
  }

  if (action === "delete") {
    const name = rest[0];
    if (!name) {
      console.error("Usage: sf sites delete <name>");
      process.exit(1);
    }

    await client.deleteSite(name);

    if (opts.json) return output({ success: true }, opts);

    console.log(`Deleted site: ${name}`);
    return;
  }

  if (action === "auth") {
    const name = rest[0];
    if (!name) {
      console.error("Usage: sf sites auth <name> <user:pass> | --remove");
      process.exit(1);
    }

    if (opts.remove) {
      const site = await client.updateAuth(name, null);

      if (opts.json) return output(site, opts);

      console.log(`Removed auth from ${name}.${DOMAIN}`);
      return;
    }

    const credentials = rest[1];
    if (!credentials || !credentials.includes(":")) {
      console.error("Usage: sf sites auth <name> <user:pass>");
      process.exit(1);
    }

    const [user, ...passParts] = credentials.split(":");
    const pass = passParts.join(":");

    const site = await client.updateAuth(name, { user, pass });

    if (opts.json) return output(site, opts);

    console.log(`Set auth for ${name}.${DOMAIN} (user: ${user})`);
    return;
  }

  console.log(SITES_HELP);
}

// === Upload ===
async function uploadSingleFile(filePath: string, site: string, subPath: string | undefined, opts: Options) {
  const bunFile = Bun.file(filePath);
  
  // Bun.file() uses full path as name (e.g., /tmp/test.html)
  // We need to extract just the filename for the server
  const filename = basename(filePath);
  const blob = await bunFile.arrayBuffer();
  const file = new File([blob], filename, { type: bunFile.type });
  
  const result = await client.uploadFile(site, file, subPath, opts.overwrite);

  if (opts.json) {
    output(result, opts);
  } else {
    console.log(`Uploaded: ${result.url}`);
  }

  return result;
}

async function uploadDirectory(dirPath: string, site: string, basePath: string, opts: Options) {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const results: any[] = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    const targetPath = basePath ? join(basePath, entry.name) : entry.name;

    if (entry.isDirectory()) {
      results.push(...await uploadDirectory(fullPath, site, targetPath, opts));
    } else {
      // Bun.file() uses full path as name - extract just the filename
      const bunFile = Bun.file(fullPath);
      const blob = await bunFile.arrayBuffer();
      const file = new File([blob], entry.name, { type: bunFile.type });
      
      const subDir = basePath || undefined;
      const result = await client.uploadFile(site, file, subDir, opts.overwrite);
      results.push(result);

      if (!opts.json) {
        console.log(`Uploaded: ${result.url}`);
      }
    }
  }

  return results;
}

export async function upload(args: string[], opts: Options) {
  const [filePath, site, subPath] = args;

  if (!filePath || !site) {
    console.log(UPLOAD_HELP);
    process.exit(1);
  }

  const stat = statSync(filePath);

  if (stat.isDirectory()) {
    const results = await uploadDirectory(filePath, site, subPath || "", opts);
    if (opts.json) {
      output(results, opts);
    } else {
      console.log(`\nUploaded ${results.length} files`);
    }
  } else {
    await uploadSingleFile(filePath, site, subPath, opts);
  }
}

// === Files ===
export async function files(args: string[], opts: Options) {
  const [site, action, filePath] = args;

  if (!site) {
    console.log(FILES_HELP);
    process.exit(1);
  }

  if (action === "delete") {
    if (!filePath) {
      console.error("Usage: sf files <site> delete <path>");
      process.exit(1);
    }

    await client.deleteFile(site, filePath);

    if (opts.json) return output({ success: true }, opts);

    console.log(`Deleted: ${filePath}`);
    return;
  }

  // Default: list
  const fileList = await client.listFiles(site);

  if (opts.json) return output(fileList, opts);

  if (fileList.length === 0) {
    console.log(`No files in ${site}. Upload with: sf upload <file> ${site}`);
    return;
  }

  console.log(`Files in ${site}:\n`);
  for (const f of fileList) {
    console.log(`  ${f.path.padEnd(40)} ${formatBytes(f.size).padStart(10)}`);
  }
  console.log(`\nTotal: ${fileList.length} files`);
}

// === Stats ===
export async function stats(args: string[], opts: Options) {
  const [site] = args;

  if (site) {
    const s = await client.getSiteStats(site);

    if (opts.json) return output(s, opts);

    console.log(`Stats for ${site}.${DOMAIN}:\n`);
    console.log(`  Files:    ${s.files}`);
    console.log(`  Size:     ${formatBytes(s.size)}`);
    console.log(`  Requests: ${s.requests}`);

    if (s.recent_paths.length > 0) {
      console.log(`\n  Top paths:`);
      for (const p of s.recent_paths.slice(0, 5)) {
        console.log(`    ${p.path.padEnd(30)} ${p.count} hits`);
      }
    }
    return;
  }

  const s = await client.getStats();

  if (opts.json) return output(s, opts);

  console.log("Global Stats:\n");
  console.log(`  Sites:    ${s.total_sites}`);
  console.log(`  Files:    ${s.total_files}`);
  console.log(`  Size:     ${formatBytes(s.total_size)}`);
  console.log(`  Requests: ${s.total_requests}`);
}

type DoctorStatus = "pass" | "warn" | "fail";
type DoctorCheck = {
  status: DoctorStatus;
  message: string;
  details?: string;
};

type DoctorReport = {
  ok: boolean;
  api_url: string;
  checks: {
    env: {
      api_url_set: boolean;
      api_key_present: boolean;
      domain_set: boolean;
    };
    health: DoctorCheck;
    auth: DoctorCheck;
  };
};

async function checkHealth(apiUrl: string): Promise<DoctorCheck> {
  try {
    const res = await fetch(`${apiUrl}/health`);
    if (res.ok) {
      return { status: "pass", message: "Health endpoint reachable", details: `HTTP ${res.status}` };
    }
    return {
      status: "fail",
      message: "Health endpoint returned error",
      details: `HTTP ${res.status}`,
    };
  } catch (e: any) {
    return {
      status: "fail",
      message: "Health endpoint unreachable",
      details: e?.message || "Unknown network error",
    };
  }
}

async function checkAuth(apiUrl: string, apiKey: string): Promise<DoctorCheck> {
  if (!apiKey) {
    return {
      status: "fail",
      message: "Missing SF_API_KEY",
      details: "Set it with: export SF_API_KEY=sk_xxxxx",
    };
  }

  try {
    const res = await fetch(`${apiUrl}/sites`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (res.ok) {
      return { status: "pass", message: "Authenticated request succeeded", details: `HTTP ${res.status}` };
    }

    if (res.status === 401) {
      return { status: "fail", message: "Authentication failed", details: "Invalid SF_API_KEY" };
    }

    return {
      status: "fail",
      message: "Authenticated request failed",
      details: `HTTP ${res.status}`,
    };
  } catch (e: any) {
    return {
      status: "fail",
      message: "Authenticated request unreachable",
      details: e?.message || "Unknown network error",
    };
  }
}

export async function doctor(args: string[], opts: Options) {
  if (args.length > 0) {
    console.log(DOCTOR_HELP);
    process.exit(1);
  }

  const envApiUrl = process.env.SF_API_URL || "";
  const envApiKey = process.env.SF_API_KEY || "";
  const envDomain = process.env.SF_DOMAIN || "";
  const apiUrl = envApiUrl || "http://localhost:3000";

  const health = await checkHealth(apiUrl);
  const auth = await checkAuth(apiUrl, envApiKey);

  const report: DoctorReport = {
    ok: health.status !== "fail" && auth.status !== "fail",
    api_url: apiUrl,
    checks: {
      env: {
        api_url_set: Boolean(envApiUrl),
        api_key_present: Boolean(envApiKey),
        domain_set: Boolean(envDomain),
      },
      health,
      auth,
    },
  };

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Doctor Report:\n");
    console.log(`  API URL:   ${apiUrl}${envApiUrl ? "" : " (default)"}`);
    console.log(`  API Key:   ${envApiKey ? "present" : "missing"}`);
    console.log(`  SF_DOMAIN: ${envDomain || "not set (optional)"}`);
    console.log("");

    console.log(`  [${health.status.toUpperCase()}] health - ${health.message}${health.details ? ` (${health.details})` : ""}`);
    console.log(`  [${auth.status.toUpperCase()}] auth   - ${auth.message}${auth.details ? ` (${auth.details})` : ""}`);

    if (!report.ok) {
      console.log("\nSuggested fixes:");
      if (!envApiKey) {
        console.log("  - export SF_API_KEY=sk_xxxxx");
      }
      if (!envApiUrl) {
        console.log("  - export SF_API_URL=http://localhost:3000");
      }
      console.log("  - Verify API is running: curl -i " + apiUrl + "/health");
    }
  }

  if (!report.ok) {
    process.exit(1);
  }
}
