/**
 * Locally sign and POST a webhook payload to a URL.
 *
 * This module is the offline counterpart to `testWebhookDelivery`: it never
 * talks to the Tango API. Use it when you want to drive a downstream receiver
 * without provisioning a real alert, or when you want to fuzz event shapes
 * that Tango wouldn't naturally emit.
 *
 * Mirrors `tango.webhooks.simulate` in the Python SDK byte-for-byte: JSON
 * payloads are serialized with sorted keys and no whitespace so signatures
 * are reproducible across runs and across SDKs.
 *
 * @example
 * ```ts
 * import { deliver } from "@makegov/tango-node";
 *
 * const result = await deliver({
 *   targetUrl: "http://localhost:4242/webhooks",
 *   payload: { events: [{ event_type: "entities.updated", uei: "ABC123" }] },
 *   secret: "dev_secret",
 * });
 * if (result.statusCode !== 200) throw new Error(result.responseBody);
 * ```
 */

import { generateSignature, parseSignatureHeader, SIGNATURE_HEADER } from "./signing.js";

/** A Tango-shaped signed request, ready to be POSTed. */
export interface SignedRequest {
  /** Exact bytes that were signed and will go on the wire. */
  body: Buffer;
  /** Bare lowercase hex signature (header prefix stripped). */
  signature: string;
  /** Headers including Content-Type and the signature header. */
  headers: Record<string, string>;
}

/** Outcome of a simulated delivery. */
export interface SimulationResult {
  statusCode: number;
  responseBody: string;
  signature: string;
  sentBytes: Buffer;
}

/** Payload type accepted by `sign` and `deliver`. */
export type SimulatePayload = object | unknown[] | string | Buffer;

/** Options for `deliver`. */
export interface DeliverOptions {
  targetUrl: string;
  payload: SimulatePayload;
  secret: string;
  extraHeaders?: Record<string, string>;
  /** Request timeout in milliseconds. Defaults to 10_000. */
  timeoutMs?: number;
}

/**
 * Serialize and sign `payload` without sending it.
 *
 * Useful for showing devs the exact wire form their handler would receive,
 * or for hand-rolling deliveries with a custom HTTP client.
 *
 * Objects and arrays are serialized with `stableStringify` (sorted keys, no
 * whitespace) so the same logical payload always produces the same signature.
 * Strings and Buffers are signed as-is.
 */
export function sign(payload: SimulatePayload, secret: string): SignedRequest {
  const body = toBuffer(payload);
  const headerValue = generateSignature(body, secret);
  const parsed = parseSignatureHeader(headerValue);
  const bareHex = parsed ? parsed.signature : "";
  return {
    body,
    signature: bareHex,
    headers: {
      "Content-Type": "application/json",
      [SIGNATURE_HEADER]: headerValue,
    },
  };
}

/**
 * Sign `payload` with `secret` and POST it to `targetUrl`.
 *
 * Uses the global `fetch` and `AbortSignal.timeout` (Node 18+). Signing is
 * computed over the exact bytes that go on the wire. Object/array payloads
 * are JSON-serialized with sorted keys (matching the Python SDK) so callers
 * across SDKs produce identical signatures for identical logical payloads.
 */
export async function deliver(opts: DeliverOptions): Promise<SimulationResult> {
  const { targetUrl, payload, secret, extraHeaders, timeoutMs = 10_000 } = opts;

  const signed = sign(payload, secret);
  const headers: Record<string, string> = { ...signed.headers };
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      headers[k] = v;
    }
  }

  const resp = await fetch(targetUrl, {
    method: "POST",
    // Node's fetch accepts Buffer at runtime; lib.dom BodyInit doesn't.
    body: signed.body as unknown as BodyInit,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const responseBody = await resp.text();
  return {
    statusCode: resp.status,
    responseBody,
    signature: signed.signature,
    sentBytes: signed.body,
  };
}

function toBuffer(payload: SimulatePayload): Buffer {
  if (Buffer.isBuffer(payload)) return payload;
  if (typeof payload === "string") return Buffer.from(payload, "utf8");
  return Buffer.from(stableStringify(payload), "utf8");
}

/**
 * Deterministic JSON serialization with sorted object keys and no whitespace.
 *
 * Matches Python's `json.dumps(payload, sort_keys=True, separators=(",", ":"))`
 * so signatures are reproducible across SDKs. Arrays preserve their order.
 *
 * Throws on circular references (matching `JSON.stringify`'s native behavior).
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const encode = (v: unknown): string => {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number") {
      // Match JSON.stringify: NaN/Infinity become "null".
      return Number.isFinite(v) ? String(v) : "null";
    }
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "string") return JSON.stringify(v);
    if (typeof v === "bigint") {
      throw new TypeError("Do not know how to serialize a BigInt");
    }
    if (Array.isArray(v)) {
      if (seen.has(v)) throw new TypeError("Converting circular structure to JSON");
      seen.add(v);
      const parts = v.map(encode);
      seen.delete(v);
      return `[${parts.join(",")}]`;
    }
    if (typeof v === "object") {
      const obj = v as Record<string, unknown>;
      if (seen.has(obj)) throw new TypeError("Converting circular structure to JSON");
      // Honor `toJSON` if present (matches JSON.stringify semantics, important
      // for Date, etc.).
      const maybeToJSON = (obj as { toJSON?: () => unknown }).toJSON;
      if (typeof maybeToJSON === "function") {
        return encode(maybeToJSON.call(obj));
      }
      seen.add(obj);
      const keys = Object.keys(obj).sort();
      const parts: string[] = [];
      for (const k of keys) {
        const val = obj[k];
        if (val === undefined) continue; // JSON.stringify drops undefined keys.
        parts.push(`${JSON.stringify(k)}:${encode(val)}`);
      }
      seen.delete(obj);
      return `{${parts.join(",")}}`;
    }
    // Functions, symbols, etc. — JSON.stringify returns undefined for these
    // at the top level, but we need a string. Match its behavior by emitting
    // "null" inside containers (we only get here from recursion).
    return "null";
  };
  return encode(value);
}
