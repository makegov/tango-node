/**
 * HMAC-SHA256 signing for Tango webhook deliveries.
 *
 * Tango signs each delivery with:
 *
 *     X-Tango-Signature: sha256=<lowercase hex HMAC-SHA256 of raw body>
 *
 * These helpers mirror the canonical Python implementation in
 * `tango.webhooks.signing` and the tango server (`webhooks/utils.py`).
 *
 * Verifiers must operate on the **raw request body** — re-serializing parsed
 * JSON will produce a different signature.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "X-Tango-Signature";
export const SIGNATURE_PREFIX = "sha256=";

function toBuffer(body: string | Buffer): Buffer {
  return typeof body === "string" ? Buffer.from(body, "utf8") : body;
}

/**
 * Generate a Tango webhook signature for the given body and secret.
 *
 * Returns the header-style value: `sha256=<lowercase hex>`. To get just the
 * hex digest (matching the Python `generate_signature` return value), strip
 * the prefix or call `parseSignatureHeader` on the result.
 */
export function generateSignature(body: string | Buffer, secret: string): string {
  const mac = createHmac("sha256", secret);
  mac.update(toBuffer(body));
  return `${SIGNATURE_PREFIX}${mac.digest("hex")}`;
}

/**
 * Parse an `X-Tango-Signature` header value into `{ algorithm, signature }`.
 *
 * Accepts both the canonical `sha256=<hex>` form and a bare hex string for
 * forward/legacy compatibility (in which case `algorithm` defaults to
 * `"sha256"`). Returns `null` for absent, empty, or malformed values
 * (e.g. `"sha256="` with no digest, or `"sha256=zzz"` with non-hex chars).
 */
export function parseSignatureHeader(
  header: string | null | undefined,
): { algorithm: string; signature: string } | null {
  if (!header) return null;
  const stripped = header.trim();
  if (!stripped) return null;

  let algorithm: string;
  let signature: string;

  const eqIdx = stripped.indexOf("=");
  if (eqIdx > 0) {
    algorithm = stripped.slice(0, eqIdx).toLowerCase();
    signature = stripped.slice(eqIdx + 1);
  } else {
    // Bare hex — assume sha256.
    algorithm = "sha256";
    signature = stripped;
  }

  if (!signature) return null;
  if (!/^[0-9a-fA-F]+$/.test(signature)) return null;

  return { algorithm, signature: signature.toLowerCase() };
}

/**
 * Verify a webhook signature header against a body and secret.
 *
 * Header format: `sha256=<hex>` (also accepts a bare hex string for legacy
 * compatibility, matching the Python `verify_signature`).
 *
 * Uses constant-time comparison via Node's `timingSafeEqual`. Returns
 * `false` for absent, empty, malformed, or mismatched headers — never
 * throws on mismatch.
 */
export function verifySignature(
  body: string | Buffer,
  header: string | null | undefined,
  secret: string,
): boolean {
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  if (parsed.algorithm !== "sha256") return false;

  const expectedHeader = generateSignature(body, secret);
  // expectedHeader is "sha256=<hex>"; strip the prefix for byte compare.
  const expectedHex = expectedHeader.slice(SIGNATURE_PREFIX.length);

  // Length mismatch fast-path — timingSafeEqual throws on unequal lengths,
  // and a length mismatch already tells us it's not a match.
  if (expectedHex.length !== parsed.signature.length) return false;

  try {
    return timingSafeEqual(
      Buffer.from(expectedHex, "hex"),
      Buffer.from(parsed.signature, "hex"),
    );
  } catch {
    return false;
  }
}
