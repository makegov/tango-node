// Dependency-free type guards. This module must not import from errors/http, which both import it.

/** Narrow an unknown value to a plain (non-array, non-null) object. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
