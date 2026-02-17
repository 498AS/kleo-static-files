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

describe("sf.sh environment behavior", () => {
  test("uses default API URL warning when SF_API_URL is missing", () => {
    const result = run("unset SF_API_URL SF_API_KEY; ./cli/sf.sh sites list");

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Warning: SF_API_URL not set, using default: http://localhost:3000");
    expect(result.stderr).toContain("Error: SF_API_KEY environment variable is required");
  });

  test("help reflects SF_API_URL default", () => {
    const result = run("./cli/sf.sh help");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("SF_API_URL    API endpoint (default: http://localhost:3000)");
  });
});
