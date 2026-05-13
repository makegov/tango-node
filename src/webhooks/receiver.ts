/**
 * Local webhook receiver for development and integration testing.
 *
 * A small `node:http` server that accepts Tango-style POSTs, verifies the
 * `X-Tango-Signature` header against a shared secret, optionally forwards
 * the request to a downstream URL (e.g. your real handler running on
 * another port), and records each delivery in memory for later inspection.
 *
 * Ported from `tango.webhooks.receiver` in the Python SDK.
 *
 * @example Programmatic use with the {@link withRunning} helper (recommended):
 *
 * ```ts
 * import { withRunning } from "@makegov/tango-node";
 *
 * await withRunning({ secret: "dev_secret" }, async (rx) => {
 *   // ... cause a webhook to fire at rx.url ...
 *   console.log(rx.deliveries);
 * });
 * ```
 *
 * @example Modern `await using` (Node 20+, TS 5.2+ with the right lib):
 *
 * ```ts
 * await using rx = await new WebhookReceiver({ secret: "dev_secret" }).run();
 * // ... rx.url, rx.deliveries ...
 * // auto-stops when the scope exits
 * ```
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AddressInfo } from "node:net";

import { SIGNATURE_HEADER, verifySignature } from "./signing.js";

const DEFAULT_PATH = "/tango/webhooks";
const DEFAULT_MAX_HISTORY = 1000;
const DEFAULT_HOST = "127.0.0.1";

/** A recorded webhook delivery. */
export interface Delivery {
  /** ISO 8601 timestamp (UTC, with `Z` suffix). */
  receivedAt: string;
  /** Request path. */
  path: string;
  /** Raw `X-Tango-Signature` header value, or `null` if absent. */
  signatureHeader: string | null;
  /** Raw request body bytes. */
  bodyBytes: Buffer;
  /** Parsed JSON body, or `null` if the body isn't valid JSON. */
  bodyJson: unknown | null;
  /** True iff the signature verified against `secret`. */
  verified: boolean;
  /** Remote socket address (best-effort), or `null` if unavailable. */
  remoteAddr: string | null;
  /** HTTP status returned by the forward target, or `null` if not forwarded. */
  forwardStatus: number | null;
  /** Error message from a failed forward, or `null` if no forward / success. */
  forwardError: string | null;
}

export interface WebhookReceiverOptions {
  /** Shared secret. Empty string disables signature verification. */
  secret?: string;
  /** URL path to accept deliveries on. Defaults to `/tango/webhooks`. */
  path?: string;
  /** Bind address. Defaults to loopback (`127.0.0.1`). */
  host?: string;
  /** TCP port. `0` (the default) lets the OS choose a free port. */
  port?: number;
  /** Optional URL to mirror each delivery to, preserving body and signature. */
  forwardTo?: string;
  /** Cap on the in-memory deliveries buffer. Defaults to 1000. */
  maxHistory?: number;
  /** Optional callback invoked once per recorded delivery. */
  onDelivery?: (d: Delivery) => void;
  /**
   * If true, unsigned or invalid deliveries get a 401 response. Defaults to
   * `true` when `secret` is non-empty, otherwise `false`.
   */
  requireSignature?: boolean;
}

/**
 * Awaitable disposable returned by {@link WebhookReceiver.run}.
 *
 * Supports both `await using` (via `Symbol.asyncDispose`) and explicit
 * `.stop()` for older runtimes / TS configs without `ESNext.Disposable`.
 */
export interface RunningReceiver extends AsyncDisposable {
  readonly url: string;
  readonly deliveries: Delivery[];
  stop(): Promise<void>;
}

/**
 * A configurable local receiver for Tango webhook deliveries.
 *
 * The server binds on `start()` and stops on `stop()`. Use {@link run} for an
 * `await using` disposable, or the module-level {@link withRunning} helper
 * for a callback-based scope.
 */
export class WebhookReceiver {
  readonly secret: string;
  readonly path: string;
  readonly host: string;
  readonly port: number;
  readonly forwardTo: string | undefined;
  readonly maxHistory: number;
  readonly onDelivery: ((d: Delivery) => void) | undefined;
  readonly requireSignature: boolean;

  private _server: Server | null = null;
  private _boundPort: number | null = null;
  private _boundHost: string | null = null;
  private _deliveries: Delivery[] = [];

  constructor(opts: WebhookReceiverOptions = {}) {
    this.secret = opts.secret ?? "";
    this.path = opts.path ?? DEFAULT_PATH;
    this.host = opts.host ?? DEFAULT_HOST;
    this.port = opts.port ?? 0;
    this.forwardTo = opts.forwardTo;
    this.maxHistory = opts.maxHistory ?? DEFAULT_MAX_HISTORY;
    this.onDelivery = opts.onDelivery;
    this.requireSignature =
      opts.requireSignature !== undefined ? opts.requireSignature : Boolean(this.secret);
  }

  /** Snapshot of recorded deliveries, oldest first. */
  get deliveries(): Delivery[] {
    return [...this._deliveries];
  }

  /** Full URL the receiver is bound to. Throws if not started. */
  get url(): string {
    if (this._server === null || this._boundPort === null) {
      throw new Error("Receiver is not running");
    }
    return `http://${this._boundHost ?? this.host}:${this._boundPort}${this.path}`;
  }

  /** Bind the socket and start serving. Resolves once the server is listening. */
  async start(): Promise<void> {
    if (this._server !== null) {
      throw new Error("Receiver already started");
    }

    const server = createServer((req, res) => {
      this._handleRequest(req, res);
    });
    // Don't keep the event loop alive on the receiver alone — match Python's
    // daemon thread semantics.
    server.unref();

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error): void => {
        server.removeListener("listening", onListening);
        reject(err);
      };
      const onListening = (): void => {
        server.removeListener("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.port, this.host);
    });

    const addr = server.address();
    if (addr === null || typeof addr === "string") {
      // Unix socket / unexpected shape — close and bail.
      await new Promise<void>((resolve) => server.close(() => resolve()));
      throw new Error("Failed to determine bound address");
    }
    const info = addr as AddressInfo;
    this._server = server;
    this._boundPort = info.port;
    this._boundHost = info.address === "::" ? "127.0.0.1" : info.address;
  }

  /** Stop the server. Idempotent — calling on a stopped receiver is a no-op. */
  async stop(): Promise<void> {
    const server = this._server;
    if (server === null) {
      return;
    }
    this._server = null;
    this._boundPort = null;
    this._boundHost = null;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
      // `close()` waits for open connections to finish; we don't keep any
      // long-lived ones, but force-close in case of a stuck socket.
      server.closeAllConnections?.();
    });
  }

  /**
   * Start the receiver and return a disposable handle. The returned object
   * works with `await using` (auto-stops at scope exit) and also exposes
   * `.stop()` for explicit teardown.
   */
  async run(): Promise<RunningReceiver> {
    await this.start();
    const receiver = this;
    const handle: RunningReceiver = {
      get url(): string {
        return receiver.url;
      },
      get deliveries(): Delivery[] {
        return receiver.deliveries;
      },
      stop: () => receiver.stop(),
      [Symbol.asyncDispose]: () => receiver.stop(),
    };
    return handle;
  }

  // --- request handling --------------------------------------------------

  private _handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const reqPath = (req.url ?? "").split("?")[0];
    if (req.method !== "POST") {
      this._writeJson(res, 405, { ok: false, error: "method_not_allowed" });
      return;
    }
    if (reqPath !== this.path) {
      this._writeJson(res, 404, { ok: false, error: "not_found" });
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const signatureRaw = req.headers[SIGNATURE_HEADER.toLowerCase()];
      const signature: string | null =
        typeof signatureRaw === "string"
          ? signatureRaw
          : Array.isArray(signatureRaw)
            ? (signatureRaw[0] ?? null)
            : null;

      const verified =
        Boolean(this.secret) && verifySignature(body, signature, this.secret);

      if (this.requireSignature && !verified) {
        this._record(req, body, signature, { verified: false });
        this._writeJson(res, 401, { ok: false, error: "invalid_signature" });
        return;
      }

      // Forward synchronously-with-respect-to-the-response. We await the
      // forward before recording so the delivery's forward_status/forward_error
      // are accurate, then write the 200.
      const finish = (forwardStatus: number | null, forwardError: string | null): void => {
        this._record(req, body, signature, { verified, forwardStatus, forwardError });
        this._writeJson(res, 200, { ok: true });
      };

      if (this.forwardTo) {
        forwardTo(this.forwardTo, body, signature).then(
          ({ status, error }) => finish(status, error),
          (err: unknown) => finish(null, err instanceof Error ? err.message : String(err)),
        );
      } else {
        finish(null, null);
      }
    });
    req.on("error", () => {
      // Swallow — connection-level errors after we've started reading are
      // best-effort. The client will see a reset; we don't record a delivery
      // for a malformed transport.
    });
  }

  private _writeJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
    const payload = Buffer.from(JSON.stringify(body), "utf8");
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Length", String(payload.length));
    res.end(payload);
  }

  private _record(
    req: IncomingMessage,
    body: Buffer,
    signature: string | null,
    opts: { verified: boolean; forwardStatus?: number | null; forwardError?: string | null },
  ): void {
    let parsed: unknown = null;
    if (body.length > 0) {
      try {
        parsed = JSON.parse(body.toString("utf8"));
      } catch {
        parsed = null;
      }
    }
    const delivery: Delivery = {
      receivedAt: new Date().toISOString(),
      path: (req.url ?? "").split("?")[0] ?? "",
      signatureHeader: signature,
      bodyBytes: body,
      bodyJson: parsed,
      verified: opts.verified,
      remoteAddr: req.socket?.remoteAddress ?? null,
      forwardStatus: opts.forwardStatus ?? null,
      forwardError: opts.forwardError ?? null,
    };
    while (this._deliveries.length >= this.maxHistory) {
      this._deliveries.shift();
    }
    this._deliveries.push(delivery);
    if (this.onDelivery !== undefined) {
      try {
        this.onDelivery(delivery);
      } catch {
        // User callback errors must not break the server.
      }
    }
  }
}

/**
 * Run a {@link WebhookReceiver} for the duration of `fn`, then stop it.
 *
 * Equivalent to Python's `with WebhookReceiver(...).run() as rx:` and safer
 * than `await using` on older runtimes (Node <20 / TS without
 * `lib: ["ESNext.Disposable"]`). The receiver is stopped even if `fn` throws.
 *
 * @example
 * ```ts
 * const result = await withRunning({ secret: "dev" }, async (rx) => {
 *   // hit rx.url, then:
 *   return rx.deliveries;
 * });
 * ```
 */
export async function withRunning<T>(
  opts: WebhookReceiverOptions,
  fn: (rx: WebhookReceiver) => Promise<T> | T,
): Promise<T> {
  const rx = new WebhookReceiver(opts);
  await rx.start();
  try {
    return await fn(rx);
  } finally {
    await rx.stop();
  }
}

// --- internal helpers ----------------------------------------------------

interface ForwardResult {
  status: number | null;
  error: string | null;
}

/**
 * POST `body` to `url` preserving the signature header.
 *
 * Uses Node's built-in `fetch`. Returns `{ status, error }` — `error` is set
 * iff the request itself failed (network error, abort, timeout); a non-2xx
 * response is reported via `status` with `error: null`.
 *
 * @internal Exported for testing only.
 */
export async function forwardTo(
  url: string,
  body: Buffer,
  signature: string | null,
): Promise<ForwardResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signature) {
    headers[SIGNATURE_HEADER] = signature;
  }
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    try {
      // Node's fetch happily accepts Buffer/Uint8Array at runtime, but the
      // lib.dom `BodyInit` typing rejects it. Cast through `unknown` to a
      // BodyInit — matches the pattern used elsewhere in this package.
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: body as unknown as BodyInit,
        signal: ac.signal,
      });
      return { status: resp.status, error: null };
    } finally {
      clearTimeout(timer);
    }
  } catch (exc) {
    return { status: null, error: exc instanceof Error ? exc.message : String(exc) };
  }
}
