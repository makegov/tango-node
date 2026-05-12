/**
 * Tests for src/webhooks/signing.ts.
 *
 * Ported from tango-python's tests/test_webhooks_signing.py. The KNOWN_VECTORS
 * are computed against Node's `node:crypto` HMAC, which has to agree with
 * Python's `hmac` byte-for-byte (both are FIPS-198 HMAC-SHA256).
 */

import { createHmac } from "node:crypto";
import { generateSignature, parseSignatureHeader, verifySignature } from "../../src/webhooks/signing.js";

function rawHex(body: string | Buffer, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

const KNOWN_VECTORS: [Buffer, string, string][] = [
  [Buffer.from(""), "dev_secret", rawHex(Buffer.from(""), "dev_secret")],
  [
    Buffer.from('{"events":[{"event_type":"entities.updated","uei":"ABC123"}]}'),
    "shh",
    rawHex('{"events":[{"event_type":"entities.updated","uei":"ABC123"}]}', "shh"),
  ],
];

describe("generateSignature", () => {
  it("matches the reference HMAC-SHA256 algorithm", () => {
    for (const [body, secret, expectedHex] of KNOWN_VECTORS) {
      expect(generateSignature(body, secret)).toBe(`sha256=${expectedHex}`);
    }
  });

  it("returns lowercase hex", () => {
    const sig = generateSignature("payload", "secret");
    expect(sig).toBe(sig.toLowerCase());
    const hex = sig.slice("sha256=".length);
    // Must parse cleanly as a hex string.
    expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
  });

  it("accepts string or Buffer body identically", () => {
    const a = generateSignature("hello", "k");
    const b = generateSignature(Buffer.from("hello", "utf8"), "k");
    expect(a).toBe(b);
  });
});

describe("verifySignature", () => {
  it("round-trips with the header form", () => {
    const body = '{"events":[{"event_type":"awards.created"}]}';
    const secret = "rotating-secret";
    const sig = generateSignature(body, secret);
    expect(verifySignature(body, sig, secret)).toBe(true);
  });

  it("accepts a bare hex string (legacy)", () => {
    const body = '{"events":[{"event_type":"awards.created"}]}';
    const secret = "rotating-secret";
    const sig = generateSignature(body, secret);
    const bareHex = sig.slice("sha256=".length);
    expect(verifySignature(body, bareHex, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const secret = "secret";
    const sig = generateSignature("original", secret);
    expect(verifySignature("tampered", sig, secret)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const sig = generateSignature("body", "right");
    expect(verifySignature("body", sig, "wrong")).toBe(false);
  });

  it("handles missing or empty header", () => {
    expect(verifySignature("body", null, "secret")).toBe(false);
    expect(verifySignature("body", undefined, "secret")).toBe(false);
    expect(verifySignature("body", "", "secret")).toBe(false);
    expect(verifySignature("body", "sha256=", "secret")).toBe(false);
  });

  it("rejects unsupported algorithms", () => {
    // We compute a valid sha256 hex but advertise it as sha1.
    const body = "body";
    const sig = generateSignature(body, "secret");
    const hex = sig.slice("sha256=".length);
    expect(verifySignature(body, `sha1=${hex}`, "secret")).toBe(false);
  });

  it("rejects garbage (non-hex) header values", () => {
    expect(verifySignature("body", "sha256=not-hex!!!", "secret")).toBe(false);
    expect(verifySignature("body", "zzz", "secret")).toBe(false);
  });
});

describe("parseSignatureHeader", () => {
  it("splits the sha256 prefix", () => {
    expect(parseSignatureHeader("sha256=abc123")).toEqual({ algorithm: "sha256", signature: "abc123" });
  });

  it("trims surrounding whitespace", () => {
    expect(parseSignatureHeader("  sha256=abc  ")).toEqual({ algorithm: "sha256", signature: "abc" });
  });

  it("accepts a bare hex string and assumes sha256", () => {
    expect(parseSignatureHeader("abc123")).toEqual({ algorithm: "sha256", signature: "abc123" });
  });

  it("lowercases the algorithm and signature", () => {
    expect(parseSignatureHeader("SHA256=ABCDEF")).toEqual({ algorithm: "sha256", signature: "abcdef" });
  });

  it("returns null for null/empty/malformed input", () => {
    expect(parseSignatureHeader(null)).toBeNull();
    expect(parseSignatureHeader(undefined)).toBeNull();
    expect(parseSignatureHeader("")).toBeNull();
    expect(parseSignatureHeader("  ")).toBeNull();
    expect(parseSignatureHeader("sha256=")).toBeNull();
    expect(parseSignatureHeader("sha256=not-hex!")).toBeNull();
  });
});
