/**
 * Tests for the `tango-node webhooks ...` CLI.
 *
 * We don't shell out to the bin script — we drive the commander program
 * directly via `buildProgram()` / the exported `run*` helpers and assert
 * on stdout/stderr + that the right SDK methods got called.
 */
import { vi, beforeEach, afterEach, describe, it, expect } from "vitest";

// Mock the SDK client before importing the CLI so the CLI's `new TangoClient(...)`
// returns our spy.
const mockClient = {
  listWebhookEndpoints: vi.fn(),
  getWebhookEndpoint: vi.fn(),
  createWebhookEndpoint: vi.fn(),
  deleteWebhookEndpoint: vi.fn(),
  listWebhookEventTypes: vi.fn(),
  getWebhookSamplePayload: vi.fn(),
  testWebhookDelivery: vi.fn(),
};

vi.mock("../../src/client.js", () => ({
  TangoClient: vi.fn().mockImplementation(() => mockClient),
}));

// Mock simulate so we can assert on its args without doing real HTTP.
const mockDeliver = vi.fn();
const mockSign = vi.fn();
vi.mock("../../src/webhooks/simulate.js", () => ({
  deliver: (...args: unknown[]) => mockDeliver(...args),
  sign: (...args: unknown[]) => mockSign(...args),
}));

// Mock the receiver so `webhooks listen` doesn't try to bind a real socket.
const mockReceiverInstance = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  url: "http://127.0.0.1:8011/tango/webhooks",
};
vi.mock("../../src/webhooks/receiver.js", () => ({
  WebhookReceiver: vi.fn().mockImplementation(() => mockReceiverInstance),
}));

// Import after the mocks are set up.
import { buildProgram, runEndpointsList, runSimulate, runListen } from "../../src/webhooks/cli.js";

// --- helpers ---------------------------------------------------------------

interface CapturedIO {
  stdout: string[];
  stderr: string[];
  restore: () => void;
}

function captureIO(): CapturedIO {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: unknown): boolean => {
    stdout.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown): boolean => {
    stderr.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  return {
    stdout,
    stderr,
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // Make sure no stray listeners pile up between tests.
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
});

// --- tests -----------------------------------------------------------------

describe("buildProgram (help output)", () => {
  it("includes every documented subcommand in --help", () => {
    const program = buildProgram();
    // commander's `helpInformation()` is the rendered help string.
    const root = program.helpInformation();
    expect(root).toContain("webhooks");

    const webhooks = program.commands.find((c) => c.name() === "webhooks");
    expect(webhooks).toBeDefined();
    const help = webhooks!.helpInformation();
    for (const expected of [
      "listen",
      "simulate",
      "trigger",
      "fetch-sample",
      "list-event-types",
      "endpoints",
    ]) {
      expect(help).toContain(expected);
    }

    // Endpoints subgroup has list/get/create/delete.
    const endpoints = webhooks!.commands.find((c) => c.name() === "endpoints");
    expect(endpoints).toBeDefined();
    const epHelp = endpoints!.helpInformation();
    for (const expected of ["list", "get", "create", "delete"]) {
      expect(epHelp).toContain(expected);
    }
  });
});

describe("webhooks endpoints list", () => {
  it("calls client.listWebhookEndpoints with parsed page/limit", async () => {
    mockClient.listWebhookEndpoints.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    const io = captureIO();
    try {
      await runEndpointsList({ page: "2", limit: "10" });
    } finally {
      io.restore();
    }

    expect(mockClient.listWebhookEndpoints).toHaveBeenCalledTimes(1);
    expect(mockClient.listWebhookEndpoints).toHaveBeenCalledWith({ page: 2, limit: 10 });
    // Output is JSON.
    const out = io.stdout.join("");
    expect(out).toContain('"count": 0');
    expect(out).toContain('"results": []');
  });

  it("uses sensible defaults when page/limit are unset", async () => {
    mockClient.listWebhookEndpoints.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    const io = captureIO();
    try {
      await runEndpointsList({});
    } finally {
      io.restore();
    }
    expect(mockClient.listWebhookEndpoints).toHaveBeenCalledWith({ page: 1, limit: 25 });
  });
});

describe("webhooks simulate", () => {
  it("invokes deliver() with target_url, payload, and secret", async () => {
    mockDeliver.mockResolvedValue({
      statusCode: 200,
      responseBody: "ok",
      signature: "deadbeef",
      sentBytes: Buffer.from("{}"),
    });

    const io = captureIO();
    try {
      const code = await runSimulate({
        to: "http://localhost:9999/hook",
        secret: "shh",
      });
      expect(code).toBe(0);
    } finally {
      io.restore();
    }

    expect(mockDeliver).toHaveBeenCalledTimes(1);
    const call = mockDeliver.mock.calls[0][0] as {
      targetUrl: string;
      payload: unknown;
      secret: string;
    };
    expect(call.targetUrl).toBe("http://localhost:9999/hook");
    expect(call.secret).toBe("shh");
    expect(call.payload).toEqual({ events: [{ event_type: "tango.cli.simulated" }] });
  });

  it("returns 2 and prints an error when --secret is missing", async () => {
    const originalSecret = process.env.TANGO_WEBHOOK_SECRET;
    delete process.env.TANGO_WEBHOOK_SECRET;
    const io = captureIO();
    try {
      const code = await runSimulate({ to: "http://example.test/hook" });
      expect(code).toBe(2);
      expect(io.stderr.join("")).toContain("--secret is required");
    } finally {
      io.restore();
      if (originalSecret !== undefined) process.env.TANGO_WEBHOOK_SECRET = originalSecret;
    }
    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it("just prints the signed request when --to is omitted", async () => {
    mockSign.mockReturnValue({
      body: Buffer.from("{}"),
      signature: "abc",
      headers: { "Content-Type": "application/json", "X-Tango-Signature": "sha256=abc" },
    });
    const io = captureIO();
    try {
      const code = await runSimulate({ secret: "shh" });
      expect(code).toBe(0);
    } finally {
      io.restore();
    }
    expect(mockDeliver).not.toHaveBeenCalled();
    expect(mockSign).toHaveBeenCalled();
    const out = io.stdout.join("");
    expect(out).toContain('"delivered": false');
  });
});

describe("webhooks listen", () => {
  it("starts the receiver and stops cleanly on SIGINT", async () => {
    const io = captureIO();
    let done: Promise<unknown>;
    try {
      done = runListen({ port: "0", host: "127.0.0.1", path: "/tango/webhooks", secret: "shh" });
      // Give the action a microtask to register signal handlers.
      await new Promise((r) => setImmediate(r));
      process.emit("SIGINT");
      await done;
    } finally {
      io.restore();
    }

    expect(mockReceiverInstance.start).toHaveBeenCalledTimes(1);
    expect(mockReceiverInstance.stop).toHaveBeenCalledTimes(1);
    // We logged that we're listening.
    expect(io.stdout.join("")).toContain("Listening on");
  });
});
