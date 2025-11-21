/**
 * Representation of decimal values from the Tango API.
 *
 * For now we keep the raw string returned by the API to avoid precision issues
 * associated with JavaScript's Number type. Callers can convert to a number or
 * use a bigint/decimal library as needed.
 */
export type DecimalLike = string;

/**
 * Parse a decimal-like value from the API into a DecimalLike.
 * Returns null if the value is not a string or number.
 */
export function parseDecimal(value: unknown): DecimalLike | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  return null;
}
