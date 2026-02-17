import { describe, test, expect, afterEach } from "bun:test";
import { validateConfig } from "../cli/client";

const ORIGINAL_ENV = {
  SF_API_URL: process.env.SF_API_URL,
  SF_API_KEY: process.env.SF_API_KEY,
};

afterEach(() => {
  if (ORIGINAL_ENV.SF_API_URL === undefined) {
    delete process.env.SF_API_URL;
  } else {
    process.env.SF_API_URL = ORIGINAL_ENV.SF_API_URL;
  }

  if (ORIGINAL_ENV.SF_API_KEY === undefined) {
    delete process.env.SF_API_KEY;
  } else {
    process.env.SF_API_KEY = ORIGINAL_ENV.SF_API_KEY;
  }
});

describe("validateConfig", () => {
  test("reports missing key as error and missing URL as warning", () => {
    delete process.env.SF_API_URL;
    delete process.env.SF_API_KEY;

    const result = validateConfig();

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("SF_API_KEY environment variable is required");
    expect(result.warnings).toContain("SF_API_URL not set, using default: http://localhost:3000");
  });

  test("allows missing URL when key is present", () => {
    delete process.env.SF_API_URL;
    process.env.SF_API_KEY = "sk_test";

    const result = validateConfig();

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.warnings).toContain("SF_API_URL not set, using default: http://localhost:3000");
  });

  test("passes cleanly when URL and key are present", () => {
    process.env.SF_API_URL = "http://localhost:3000";
    process.env.SF_API_KEY = "sk_test";

    const result = validateConfig();

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.warnings.length).toBe(0);
  });
});
