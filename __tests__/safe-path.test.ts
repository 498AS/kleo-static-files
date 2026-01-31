import { describe, test, expect } from "bun:test";
import { safePath } from "../server/utils/safe-path";
import { resolve, sep } from "path";

describe("safePath", () => {
  const base = "/var/sites/mysite";

  describe("valid paths", () => {
    test("simple filename", () => {
      const result = safePath(base, "file.txt");
      expect(result).toBe(resolve(base, "file.txt"));
    });

    test("subdirectory", () => {
      const result = safePath(base, "css/style.css");
      expect(result).toBe(resolve(base, "css/style.css"));
    });

    test("nested subdirectory", () => {
      const result = safePath(base, "a/b/c/file.txt");
      expect(result).toBe(resolve(base, "a/b/c/file.txt"));
    });

    test("empty path returns base", () => {
      const result = safePath(base, "");
      expect(result).toBe(resolve(base));
    });

    test("current directory reference", () => {
      const result = safePath(base, "./file.txt");
      expect(result).toBe(resolve(base, "file.txt"));
    });

    test("complex but valid path with .. inside", () => {
      // a/b/../c normalizes to a/c, which is still inside base
      const result = safePath(base, "a/b/../c/file.txt");
      expect(result).toBe(resolve(base, "a/c/file.txt"));
    });
  });

  describe("path traversal attacks", () => {
    test("simple parent directory", () => {
      const result = safePath(base, "../etc/passwd");
      expect(result).toBeNull();
    });

    test("double parent directory", () => {
      const result = safePath(base, "../../etc/passwd");
      expect(result).toBeNull();
    });

    test("nested then escape", () => {
      const result = safePath(base, "foo/../../../etc/passwd");
      expect(result).toBeNull();
    });

    test("deep escape", () => {
      const result = safePath(base, "../../../../../../../../etc/passwd");
      expect(result).toBeNull();
    });

    test("root path", () => {
      const result = safePath(base, "/etc/passwd");
      expect(result).toBeNull();
    });

    test("double slash trick", () => {
      const result = safePath(base, "//etc/passwd");
      expect(result).toBeNull();
    });

    test("encoded traversal (if decoded before calling)", () => {
      // This assumes URL decoding happened before safePath is called
      const decoded = decodeURIComponent("..%2Fetc%2Fpasswd");
      const result = safePath(base, decoded);
      expect(result).toBeNull();
    });

    test("backslash on unix (normalize handles this)", () => {
      const result = safePath(base, "..\\..\\etc\\passwd");
      // On Unix, backslashes are valid filename chars but normalize may handle them
      // The key is it shouldn't escape the base
      if (result !== null) {
        expect(result.startsWith(resolve(base))).toBe(true);
      }
    });

    test("null byte injection", () => {
      // While bun/node may handle this, safePath shouldn't allow escape
      const result = safePath(base, "file.txt\0../../../etc/passwd");
      // Either null or a safe path
      if (result !== null) {
        expect(result.startsWith(resolve(base))).toBe(true);
      }
    });
  });

  describe("edge cases", () => {
    test("trailing slash", () => {
      const result = safePath(base, "dir/");
      expect(result).toBe(resolve(base, "dir/"));
    });

    test("multiple slashes", () => {
      const result = safePath(base, "a///b///c");
      // Should normalize to a/b/c
      expect(result).toBe(resolve(base, "a/b/c"));
    });

    test("dot files are valid", () => {
      const result = safePath(base, ".hidden");
      expect(result).toBe(resolve(base, ".hidden"));
    });

    test("dotdot in filename is valid", () => {
      const result = safePath(base, "file..txt");
      expect(result).toBe(resolve(base, "file..txt"));
    });
  });
});
