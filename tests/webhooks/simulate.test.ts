/**
 * Tests for src/webhooks/simulate.ts.
 *
 * Mirrors tango-python's tests/test_webhooks_simulate.py: a mix of pure-unit
 * checks on `sign()` and round-trips through a real `node:http` server for
 * `deliver()`.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SIGNATURE_HEADER,
  deliver,
  sign,
  stableStringify,
  verifySignature,
} from "../../src/webhooks/index.js";

const SECRET = "dev_secret";

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}

interface Listening {
  server: Server;
  url: string;
}

async function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
): Promise<Listening> {
  const server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((err) => {
      // Don't let exceptions hang the test.
      res.statusCode = 500;
      res.end(String((err as Error).message || err));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${addr.port}/hook` };
}

async function close(s: Server): Promise<void> {
  await new Promise<void>((resolve) => s.close(() => resolve()));
}

describe("sign", () => {
  it("produces the same signature regardless of key order", () => {
    const a = sign({ a: 1, b: 2 }, "k");
    const b = sign({ b: 2, a: 1 }, "k");
    expect(a.signature).toBe(b.signature);
    expect(a.body.toString("utf8")).toBe(b.body.toString("utf8"));
  });

  it("is reproducible across nested objects", () => {
    const a = sign({ outer: { z: 1, a: 2 }, list: [{ y: 1, x: 2 }] }, "k");
    const b = sign({ list: [{ x: 2, y: 1 }], outer: { a: 2, z: 1 } }, "k");
    expect(a.signature).toBe(b.signature);
  });

  it("preserves array order", () => {
    // Arrays are NOT sorted — only object keys.
    const a = sign([1, 2, 3], "k");
    const b = sign([3, 2, 1], "k");
    expect(a.signature).not.toBe(b.signature);
  });

  it("emits the correct headers", () => {
    const signed = sign({ foo: 1 }, SECRET);
    expect(signed.headers["Content-Type"]).toBe("application/json");
    expect(signed.headers[SIGNATURE_HEADER]).toMatch(/^sha256=[0-9a-f]+$/);
    // Bare signature has the prefix stripped.
    expect(signed.signature).toMatch(/^[0-9a-f]+$/);
    expect(signed.headers[SIGNATURE_HEADER]).toBe(`sha256=${signed.signature}`);
  });

  it("signs with verifySignature-compatible output", () => {
    const signed = sign({ event_type: "entities.updated", uei: "ABC123" }, SECRET);
    expect(verifySignature(signed.body, signed.headers[SIGNATURE_HEADER], SECRET)).toBe(true);
    // Tampered body fails.
    expect(verifySignature(Buffer.from("nope"), signed.headers[SIGNATURE_HEADER], SECRET)).toBe(
      false,
    );
  });

  it("accepts a pre-serialized string verbatim", () => {
    const raw = '{"b":2,"a":1}'; // intentionally unsorted
    const signed = sign(raw, SECRET);
    expect(signed.body.toString("utf8")).toBe(raw);
    // Signs the exact bytes we passed in — NOT a re-serialized form.
    expect(verifySignature(raw, signed.headers[SIGNATURE_HEADER], SECRET)).toBe(true);
  });

  it("accepts a Buffer verbatim", () => {
    const buf = Buffer.from("\x00\x01\x02raw-bytes", "utf8");
    const signed = sign(buf, SECRET);
    expect(Buffer.compare(signed.body, buf)).toBe(0);
    expect(verifySignature(buf, signed.headers[SIGNATURE_HEADER], SECRET)).toBe(true);
  });
});

describe("stableStringify", () => {
  it("sorts object keys", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("preserves array order and serializes nested objects", () => {
    expect(stableStringify([{ z: 1, a: 2 }, 3])).toBe('[{"a":2,"z":1},3]');
  });

  it("drops undefined object values like JSON.stringify", () => {
    expect(stableStringify({ a: 1, b: undefined, c: 2 })).toBe('{"a":1,"c":2}');
  });

  it("emits null for null and for non-finite numbers", () => {
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify([NaN, Infinity])).toBe("[null,null]");
  });

  it("matches Python's separators=(',',':') — no whitespace", () => {
    const s = stableStringify({ a: [1, 2, 3], b: { c: "x" } });
    expect(s).toBe('{"a":[1,2,3],"b":{"c":"x"}}');
    expect(s).not.toMatch(/\s/);
  });
});

describe("deliver - mocked fetch", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("posts to the captured URL with the expected headers and body", async () => {
    const captured: {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: Buffer;
    } = {};
    globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
      captured.url = String(input);
      captured.method = init?.method;
      // Headers can come back as a plain object here since that's what we send.
      captured.headers = init?.headers as Record<string, string>;
      captured.body = init?.body as Buffer;
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    const result = await deliver({
      targetUrl: "https://example.test/hook",
      payload: { b: 2, a: 1 },
      secret: SECRET,
      extraHeaders: { "X-Trace": "abc" },
    });

    expect(captured.url).toBe("https://example.test/hook");
    expect(captured.method).toBe("POST");
    expect(captured.headers?.["Content-Type"]).toBe("application/json");
    expect(captured.headers?.[SIGNATURE_HEADER]).toMatch(/^sha256=[0-9a-f]+$/);
    expect(captured.headers?.["X-Trace"]).toBe("abc");
    // Body is the stable-stringified form (sorted keys).
    expect(captured.body?.toString("utf8")).toBe('{"a":1,"b":2}');

    expect(result.statusCode).toBe(200);
    expect(result.responseBody).toBe("ok");
    expect(result.signature).toMatch(/^[0-9a-f]+$/);
    expect(Buffer.compare(result.sentBytes, Buffer.from('{"a":1,"b":2}', "utf8"))).toBe(0);
  });

  it("uses AbortSignal.timeout for the timeoutMs option", async () => {
    let observedSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
      observedSignal = init?.signal ?? undefined;
      return new Response("ok", { status: 200 });
    }) as unknown as typeof fetch;

    await deliver({
      targetUrl: "https://example.test/hook",
      payload: { foo: 1 },
      secret: SECRET,
      timeoutMs: 5_000,
    });

    expect(observedSignal).toBeInstanceOf(AbortSignal);
  });

  it("aborts when the server is too slow", async () => {
    // Server that never responds within the timeout window.
    const { server, url } = await listen(async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      res.statusCode = 200;
      res.end("late");
    });
    try {
      await expect(
        deliver({
          targetUrl: url,
          payload: { foo: 1 },
          secret: SECRET,
          timeoutMs: 25,
        }),
      ).rejects.toThrow();
    } finally {
      await close(server);
    }
  });
});

describe("deliver - round-trip through real http server", () => {
  it("delivers a signed body that verifies on the receiver side", async () => {
    const seen: { body?: Buffer; sigHeader?: string } = {};
    const { server, url } = await listen(async (req, res) => {
      seen.body = await readBody(req);
      const headerKey = SIGNATURE_HEADER.toLowerCase();
      seen.sigHeader = req.headers[headerKey] as string | undefined;
      res.statusCode = 202;
      res.setHeader("Content-Type", "text/plain");
      res.end("received");
    });

    try {
      const payload = { events: [{ event_type: "entities.updated", uei: "ABC123" }] };
      const result = await deliver({ targetUrl: url, payload, secret: SECRET });

      expect(result.statusCode).toBe(202);
      expect(result.responseBody).toBe("received");
      // The server saw the exact bytes we put on the wire.
      expect(seen.body && Buffer.compare(seen.body, result.sentBytes)).toBe(0);
      // And the signature header verifies against those bytes.
      expect(seen.sigHeader).toMatch(/^sha256=[0-9a-f]+$/);
      expect(verifySignature(seen.body as Buffer, seen.sigHeader, SECRET)).toBe(true);
    } finally {
      await close(server);
    }
  });

  it("propagates the server's status code and body", async () => {
    const { server, url } = await listen((req, res) => {
      res.statusCode = 418;
      res.end("teapot");
    });
    try {
      const result = await deliver({
        targetUrl: url,
        payload: { foo: "bar" },
        secret: SECRET,
      });
      expect(result.statusCode).toBe(418);
      expect(result.responseBody).toBe("teapot");
    } finally {
      await close(server);
    }
  });
});
