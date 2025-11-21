/**
 * Parse a date string from the Tango API into a JavaScript Date object.
 * Returns null if the input is falsy or cannot be parsed.
 *
 * The Tango API generally returns ISO-8601 formatted strings, which Date can parse
 * reliably in modern runtimes.
 */
export function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d;
}

/**
 * Alias for parseDate for now. If the API starts returning timestamps with time
 * components distinct from plain dates, this function can be specialized.
 */
export function parseDateTime(value: unknown): Date | null {
  return parseDate(value);
}
