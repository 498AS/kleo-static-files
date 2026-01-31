import { resolve, sep, normalize } from "path";

/**
 * Validates and resolves a user-provided path to prevent path traversal attacks.
 * 
 * @param base - The base directory that the path must stay within
 * @param userPath - The user-provided path to validate
 * @returns The resolved absolute path if safe, null if path traversal detected
 */
export function safePath(base: string, userPath: string): string | null {
  // Normalize to prevent tricks like /foo/./bar or /foo//bar
  const normalizedUser = normalize(userPath);
  
  // Resolve to absolute paths
  const resolvedBase = resolve(base);
  const resolvedPath = resolve(base, normalizedUser);
  
  // Ensure the resolved path starts with base + separator (or equals base)
  // This prevents accessing parent directories
  if (!resolvedPath.startsWith(resolvedBase + sep) && resolvedPath !== resolvedBase) {
    return null;
  }
  
  return resolvedPath;
}
