import { describe, test, expect } from "bun:test";
import { resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");

function run(command: string, env: Record<string, string | undefined> = {}) {
  const proc = Bun.spawnSync(["bash", "-lc", command], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  return {
    exitCode: proc.exitCode,
    stdout: Buffer.from(proc.stdout).toString("utf8"),
    stderr: Buffer.from(proc.stderr).toString("utf8"),
  };
}

describe("sf doctor", () => {
  test("returns JSON diagnostics and non-zero when API key is missing", () => {
    const result = run("unset SF_API_KEY SF_API_URL SF_DOMAIN; bun run cli/index.ts doctor --json");
    expect(result.exitCode).toBe(1);

    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(false);
    expect(data.api_url).toBe("http://localhost:3000");
    expect(data.checks.env.api_key_present).toBe(false);
    expect(data.checks.auth.status).toBe("fail");
  });

  test("fails connectivity and auth checks with unreachable API URL", () => {
    const result = run("bun run cli/index.ts doctor --json", {
      SF_API_URL: "http://127.0.0.1:9",
      SF_API_KEY: "sk_test",
    });
    expect(result.exitCode).toBe(1);

    const data = JSON.parse(result.stdout);
    expect(data.ok).toBe(false);
    expect(data.checks.health.status).toBe("fail");
    expect(data.checks.auth.status).toBe("fail");
  });
});
