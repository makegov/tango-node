/**
 * Unflatten a flat object with dot-separated keys into nested objects.
 *
 * Example:
 *   { "recipient.display_name": "Acme" } ->
 *   { recipient: { display_name: "Acme" } }
 *
 * This mirrors the behavior of the Python client's `_unflatten_response`.
 */
export function unflattenResponse<T extends Record<string, unknown>>(
  data: T,
  joiner = ".",
): Record<string, unknown> {
  if (!data || typeof data !== "object") {
    return data as unknown as Record<string, unknown>;
  }

  const keys = Object.keys(data);
  const hasFlatKeys = keys.some((key) => key.includes(joiner));
  if (!hasFlatKeys) {
    return { ...data };
  }

  const result: Record<string, unknown> = {};

  for (const [flatKey, value] of Object.entries(data)) {
    if (!flatKey.includes(joiner)) {
      result[flatKey] = value;
      continue;
    }

    const parts = flatKey.split(joiner);
    let current: Record<string, unknown> = result;

    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      const existing = current[part];

      if (existing == null) {
        const next: Record<string, unknown> = {};
        current[part] = next;
        current = next;
      } else if (typeof existing === "object" && !Array.isArray(existing)) {
        current = existing as Record<string, unknown>;
      } else {
        // Collision: primitive where we expected an object. Overwrite with object.
        const next: Record<string, unknown> = {};
        current[part] = next;
        current = next;
      }
    }

    current[parts[parts.length - 1]] = value;
  }

  return result;
}
