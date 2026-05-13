/**
 * Tests for src/webhooks/receiver.ts.
 *
 * Ported from tango-python's tests/test_webhooks_receiver.py. Each test
 * starts a real `node:http` server on an OS-assigned port and POSTs to it
 * using global `fetch`, matching how the Python tests use `httpx`.
 */

import { describe, expect, it, vi } from "vitest";

import {
  generateSignature,
  SIGNATURE_HEADER,
  WebhookReceiver,
  withRunning,
  type Delivery,
} from "../../src/webhooks/index.js";

const SECRET = "test_secret";

async function postJson(
  url: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

describe("WebhookReceiver - lifecycle", () => {
  it("starts on an OS-assigned port and exposes a usable url", async () => {
    const rx = new WebhookReceiver({ secret: SECRET });
    await rx.start();
    try {
      expect(rx.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/tango\/webhooks$/);
      const port = Number(new URL(rx.url).port);
      expect(port).toBeGreaterThan(0);
    } finally {
      await rx.stop();
    }
  });

  it("throws on url before start()", () => {
    const rx = new WebhookReceiver();
    expect(() => rx.url).toThrow(/not running/i);
  });

  it("throws on double-start", async () => {
    const rx = new WebhookReceiver();
    await rx.start();
    try {
      await expect(rx.start()).rejects.toThrow(/already started/i);
    } finally {
      await rx.stop();
    }
  });

  it("stop() is idempotent", async () => {
    const rx = new WebhookReceiver();
    await rx.start();
    await rx.stop();
    await rx.stop(); // no throw
    expect(() => rx.url).toThrow();
  });

  it("respects a custom path", async () => {
    const rx = new WebhookReceiver({ path: "/hook" });
    await rx.start();
    try {
      expect(rx.url).toMatch(/\/hook$/);
      const resp = await postJson(rx.url, "{}");
      expect(resp.status).toBe(200);
    } finally {
      await rx.stop();
    }
  });
});

describe("WebhookReceiver - signature verification", () => {
  it("records a valid signed POST as verified=true and fires the callback", async () => {
    const seen: Delivery[] = [];
    const rx = new WebhookReceiver({
      secret: SECRET,
      onDelivery: (d) => seen.push(d),
    });
    await rx.start();
    try {
      const body = JSON.stringify({ events: [{ event_type: "entities.updated", uei: "ABC" }] });
      const sig = generateSignature(body, SECRET);
      const resp = await postJson(rx.url, body, { [SIGNATURE_HEADER]: sig });
      expect(resp.status).toBe(200);
      const { ok } = (await resp.json()) as { ok: boolean };
      expect(ok).toBe(true);

      expect(rx.deliveries).toHaveLength(1);
      const d = rx.deliveries[0]!;
      expect(d.verified).toBe(true);
      expect(d.signatureHeader).toBe(sig);
      expect(d.bodyBytes.toString("utf8")).toBe(body);
      expect(d.bodyJson).toEqual({ events: [{ event_type: "entities.updated", uei: "ABC" }] });
      expect(d.path).toBe("/tango/webhooks");
      expect(d.forwardStatus).toBeNull();
      expect(d.forwardError).toBeNull();
      expect(d.remoteAddr).toBeTruthy();
      expect(d.receivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T.+Z$/);

      // Callback ran.
      expect(seen).toHaveLength(1);
      expect(seen[0]!.verified).toBe(true);
    } finally {
      await rx.stop();
    }
  });

  it("returns 401 and records verified=false on invalid signature when requireSignature=true", async () => {
    const rx = new WebhookReceiver({ secret: SECRET });
    await rx.start();
    try {
      const body = '{"events":[]}';
      const resp = await postJson(rx.url, body, {
        [SIGNATURE_HEADER]: "sha256=deadbeef",
      });
      expect(resp.status).toBe(401);
      const { ok, error } = (await resp.json()) as { ok: boolean; error: string };
      expect(ok).toBe(false);
      expect(error).toBe("invalid_signature");

      expect(rx.deliveries).toHaveLength(1);
      expect(rx.deliveries[0]!.verified).toBe(false);
      expect(rx.deliveries[0]!.signatureHeader).toBe("sha256=deadbeef");
    } finally {
      await rx.stop();
    }
  });

  it("returns 401 when no signature header is present and requireSignature is true", async () => {
    const rx = new WebhookReceiver({ secret: SECRET });
    await rx.start();
    try {
      const resp = await postJson(rx.url, '{"a":1}');
      expect(resp.status).toBe(401);
      expect(rx.deliveries).toHaveLength(1);
      expect(rx.deliveries[0]!.verified).toBe(false);
      expect(rx.deliveries[0]!.signatureHeader).toBeNull();
    } finally {
      await rx.stop();
    }
  });

  it("with no secret, records every POST as verified=false and returns 200", async () => {
    const rx = new WebhookReceiver(); // no secret
    await rx.start();
    try {
      const resp = await postJson(rx.url, '{"hello":"world"}');
      expect(resp.status).toBe(200);
      expect(rx.deliveries).toHaveLength(1);
      expect(rx.deliveries[0]!.verified).toBe(false);
      expect(rx.deliveries[0]!.bodyJson).toEqual({ hello: "world" });
    } finally {
      await rx.stop();
    }
  });

  it("with requireSignature=false and a secret, accepts unsigned but still flags verified=false", async () => {
    const rx = new WebhookReceiver({ secret: SECRET, requireSignature: false });
    await rx.start();
    try {
      const resp = await postJson(rx.url, '{"x":1}');
      expect(resp.status).toBe(200);
      expect(rx.deliveries[0]!.verified).toBe(false);
    } finally {
      await rx.stop();
    }
  });

  it("records non-JSON bodies with bodyJson=null", async () => {
    const rx = new WebhookReceiver();
    await rx.start();
    try {
      const resp = await postJson(rx.url, "not json at all", { "Content-Type": "text/plain" });
      expect(resp.status).toBe(200);
      expect(rx.deliveries[0]!.bodyJson).toBeNull();
      expect(rx.deliveries[0]!.bodyBytes.toString("utf8")).toBe("not json at all");
    } finally {
      await rx.stop();
    }
  });
});

describe("WebhookReceiver - routing", () => {
  it("returns 404 for wrong path", async () => {
    const rx = new WebhookReceiver();
    await rx.start();
    try {
      const base = rx.url.replace("/tango/webhooks", "");
      const resp = await postJson(`${base}/nope`, "{}");
      expect(resp.status).toBe(404);
      expect(rx.deliveries).toHaveLength(0);
    } finally {
      await rx.stop();
    }
  });

  it("returns 405 for non-POST methods", async () => {
    const rx = new WebhookReceiver();
    await rx.start();
    try {
      const resp = await fetch(rx.url, { method: "GET" });
      expect(resp.status).toBe(405);
      expect(rx.deliveries).toHaveLength(0);
    } finally {
      await rx.stop();
    }
  });
});

describe("WebhookReceiver - forwarding", () => {
  it("forwards body+signature to forwardTo and records the forward status", async () => {
    // Spin up a second receiver as the forward target.
    const downstream = new WebhookReceiver({ secret: SECRET });
    await downstream.start();
    const upstream = new WebhookReceiver({ secret: SECRET, forwardTo: downstream.url });
    await upstream.start();

    try {
      const body = '{"events":[{"event_type":"x"}]}';
      const sig = generateSignature(body, SECRET);
      const resp = await postJson(upstream.url, body, { [SIGNATURE_HEADER]: sig });
      expect(resp.status).toBe(200);

      expect(upstream.deliveries).toHaveLength(1);
      expect(upstream.deliveries[0]!.forwardStatus).toBe(200);
      expect(upstream.deliveries[0]!.forwardError).toBeNull();

      // Downstream got the forwarded request with the original signature.
      expect(downstream.deliveries).toHaveLength(1);
      expect(downstream.deliveries[0]!.verified).toBe(true);
      expect(downstream.deliveries[0]!.signatureHeader).toBe(sig);
    } finally {
      await upstream.stop();
      await downstream.stop();
    }
  });

  it("records forwardError when the forward target is unreachable", async () => {
    // Reserve a free port by binding+closing.
    const probe = new WebhookReceiver();
    await probe.start();
    const deadUrl = probe.url;
    await probe.stop();

    const rx = new WebhookReceiver({ secret: SECRET, forwardTo: deadUrl });
    await rx.start();
    try {
      const body = '{"x":1}';
      const sig = generateSignature(body, SECRET);
      const resp = await postJson(rx.url, body, { [SIGNATURE_HEADER]: sig });
      expect(resp.status).toBe(200);
      expect(rx.deliveries[0]!.forwardStatus).toBeNull();
      expect(rx.deliveries[0]!.forwardError).toBeTruthy();
    } finally {
      await rx.stop();
    }
  });
});

describe("WebhookReceiver - history cap", () => {
  it("drops oldest deliveries past maxHistory", async () => {
    const rx = new WebhookReceiver({ maxHistory: 3 });
    await rx.start();
    try {
      for (let i = 0; i < 5; i++) {
        await postJson(rx.url, JSON.stringify({ n: i }));
      }
      expect(rx.deliveries).toHaveLength(3);
      const ns = rx.deliveries.map((d) => (d.bodyJson as { n: number }).n);
      expect(ns).toEqual([2, 3, 4]);
    } finally {
      await rx.stop();
    }
  });
});

describe("withRunning", () => {
  it("starts the receiver, returns the callback result, and stops on success", async () => {
    const result = await withRunning({ secret: SECRET }, async (rx) => {
      const body = '{"y":2}';
      const sig = generateSignature(body, SECRET);
      const resp = await postJson(rx.url, body, { [SIGNATURE_HEADER]: sig });
      expect(resp.status).toBe(200);
      return rx.deliveries.length;
    });
    expect(result).toBe(1);
  });

  it("auto-stops the receiver if the callback throws", async () => {
    let capturedUrl = "";
    await expect(
      withRunning({}, async (rx) => {
        capturedUrl = rx.url;
        throw new Error("boom");
      }),
    ).rejects.toThrow(/boom/);

    // Server should be shut down — a fetch to its old URL should fail
    // (ECONNREFUSED) rather than connect.
    expect(capturedUrl).toMatch(/^http:\/\//);
    await expect(fetch(capturedUrl, { method: "POST", body: "{}" })).rejects.toBeTruthy();
  });
});

describe("run() / Symbol.asyncDispose", () => {
  it("returns a handle with url, deliveries, stop, and Symbol.asyncDispose", async () => {
    const rx = new WebhookReceiver();
    const handle = await rx.run();
    try {
      expect(handle.url).toMatch(/^http:\/\//);
      expect(handle.deliveries).toEqual([]);
      expect(typeof handle.stop).toBe("function");
      expect(typeof handle[Symbol.asyncDispose]).toBe("function");
    } finally {
      await handle.stop();
    }
  });

  it("Symbol.asyncDispose stops the server", async () => {
    const rx = new WebhookReceiver();
    const handle = await rx.run();
    const url = handle.url;
    await handle[Symbol.asyncDispose]();
    expect(() => rx.url).toThrow();
    // And a fresh request to the now-stopped server should fail.
    await expect(fetch(url, { method: "POST", body: "{}" })).rejects.toBeTruthy();
  });
});

describe("WebhookReceiver - onDelivery error safety", () => {
  it("does not crash the request when onDelivery throws", async () => {
    const onDelivery = vi.fn(() => {
      throw new Error("callback boom");
    });
    const rx = new WebhookReceiver({ onDelivery });
    await rx.start();
    try {
      const resp = await postJson(rx.url, '{"a":1}');
      expect(resp.status).toBe(200);
      expect(onDelivery).toHaveBeenCalledOnce();
      expect(rx.deliveries).toHaveLength(1);
    } finally {
      await rx.stop();
    }
  });
});
