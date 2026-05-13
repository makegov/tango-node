/**
 * Command-line interface for Tango webhook tooling.
 *
 * Ported from `tango.webhooks.cli` in the Python SDK. Wired up via the
 * `tango-node` console script defined in `package.json`'s `bin` field.
 *
 * Subcommands mirror the Python CLI 1:1:
 *
 *   tango-node webhooks listen          # local receiver
 *   tango-node webhooks simulate        # locally-signed delivery
 *   tango-node webhooks trigger         # ask Tango to send a real test
 *   tango-node webhooks fetch-sample    # canonical sample payload
 *   tango-node webhooks list-event-types
 *   tango-node webhooks endpoints {list,get,create,delete}
 */
import { readFileSync } from "node:fs";

import { Command, Option } from "commander";

import { TangoClient } from "../client.js";
import { WebhookReceiver, type Delivery } from "./receiver.js";
import { deliver, sign } from "./simulate.js";
import { SIGNATURE_PREFIX } from "./signing.js";

const DEFAULT_BASE_URL = "https://tango.makegov.com";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/**
 * Build a TangoClient from CLI options, honoring TANGO_API_KEY / TANGO_BASE_URL
 * but letting explicit `--api-key` / `--base-url` flags win.
 */
function makeClient(opts: { apiKey?: string; baseUrl?: string }): TangoClient {
  return new TangoClient({
    apiKey: opts.apiKey ?? process.env.TANGO_API_KEY ?? undefined,
    baseUrl: opts.baseUrl ?? process.env.TANGO_BASE_URL ?? DEFAULT_BASE_URL,
  });
}

/** stdout writer that's mockable in tests if we want to. */
function emit(line: string): void {
  process.stdout.write(`${line}\n`);
}

function emitErr(line: string): void {
  process.stderr.write(`${line}\n`);
}

function emitJson(value: unknown): void {
  emit(JSON.stringify(value, null, 2));
}

/** Common `--api-key` / `--base-url` options applied to every API-touching cmd. */
function withApiOptions(cmd: Command): Command {
  return cmd
    .option("--api-key <key>", "Tango API key (or set TANGO_API_KEY).")
    .option(
      "--base-url <url>",
      `Tango base URL (or set TANGO_BASE_URL). Defaults to ${DEFAULT_BASE_URL}.`,
    );
}

// ---------------------------------------------------------------------------
// `webhooks listen`
// ---------------------------------------------------------------------------

interface ListenOptions {
  port: string;
  host: string;
  path: string;
  secret?: string;
  forwardTo?: string;
  requireSignature?: boolean;
}

/**
 * Run a local receiver and stream deliveries to stdout. Blocks until the
 * process receives SIGINT/SIGTERM, then stops the receiver cleanly.
 *
 * Exported (rather than only registered) so tests can drive it without
 * spawning a subprocess.
 */
export async function runListen(opts: ListenOptions): Promise<WebhookReceiver> {
  const secret = opts.secret ?? process.env.TANGO_WEBHOOK_SECRET ?? "";
  const port = Number.parseInt(opts.port, 10);
  if (!Number.isFinite(port)) {
    throw new Error(`Invalid --port: ${opts.port}`);
  }
  const receiver = new WebhookReceiver({
    secret,
    path: opts.path,
    host: opts.host,
    port,
    forwardTo: opts.forwardTo,
    requireSignature: opts.requireSignature,
    onDelivery: printDelivery,
  });
  await receiver.start();
  emit(`Listening on ${receiver.url}`);
  if (!secret) {
    emitErr("  WARNING: no --secret provided; signatures will not be verified.");
  }
  if (opts.forwardTo) {
    emit(`  Forwarding to ${opts.forwardTo}`);
  }
  emit("  Press Ctrl+C to stop.");

  await new Promise<void>((resolve) => {
    const stop = (): void => {
      emit("\nStopping...");
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });

  await receiver.stop();
  return receiver;
}

function printDelivery(delivery: Delivery): void {
  const status = delivery.verified ? "verified" : "UNVERIFIED";
  const summary = summarizeBody(delivery.bodyJson);
  const parts = [delivery.receivedAt, status, summary];
  if (delivery.forwardStatus !== null) {
    parts.push(`forwarded=${delivery.forwardStatus}`);
  }
  if (delivery.forwardError) {
    parts.push(`forward_error=${delivery.forwardError}`);
  }
  emit(parts.join(" | "));
  if (delivery.bodyJson !== null) {
    emit(JSON.stringify(delivery.bodyJson, null, 2));
  }
  emit("");
}

function summarizeBody(body: unknown): string {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const events = (body as Record<string, unknown>).events;
    if (Array.isArray(events) && events.length > 0 && typeof events[0] === "object" && events[0]) {
      const first = events[0] as Record<string, unknown>;
      const eventType = typeof first.event_type === "string" ? first.event_type : "?";
      return `${eventType} (n=${events.length})`;
    }
  }
  return "(no events)";
}

// ---------------------------------------------------------------------------
// `webhooks simulate`
// ---------------------------------------------------------------------------

interface SimulateOptions {
  to?: string;
  secret?: string;
  payloadFile?: string;
  eventType?: string;
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Build the payload + sign it. If `--to` is given, POST it; otherwise just
 * print the signed wire form (matches Python's `simulate_cmd`).
 */
export async function runSimulate(opts: SimulateOptions): Promise<number> {
  const secret = opts.secret ?? process.env.TANGO_WEBHOOK_SECRET;
  if (!secret) {
    emitErr("error: --secret is required (or set TANGO_WEBHOOK_SECRET).");
    return 2;
  }
  if (opts.payloadFile && opts.eventType) {
    emitErr("error: use either --payload-file or --event-type, not both.");
    return 2;
  }

  let payload: unknown;
  if (opts.payloadFile) {
    const raw = readFileSync(opts.payloadFile, "utf8");
    payload = JSON.parse(raw);
  } else if (opts.eventType) {
    const client = makeClient(opts);
    payload = await client.getWebhookSamplePayload({ eventType: opts.eventType });
  } else {
    payload = { events: [{ event_type: "tango.cli.simulated" }] };
  }

  if (!opts.to) {
    const signed = sign(payload as object, secret);
    emitJson({
      delivered: false,
      headers: signed.headers,
      sent_payload: payload,
    });
    return 0;
  }

  const result = await deliver({
    targetUrl: opts.to,
    payload: payload as object,
    secret,
  });
  emitJson({
    delivered: true,
    target_url: opts.to,
    status_code: result.statusCode,
    signature: `${SIGNATURE_PREFIX}${result.signature}`,
    sent_payload: payload,
    receiver_response: result.responseBody.slice(0, 500),
  });
  return result.statusCode >= 400 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// `webhooks trigger`
// ---------------------------------------------------------------------------

interface TriggerOptions {
  endpointId?: string;
  apiKey?: string;
  baseUrl?: string;
}

export async function runTrigger(opts: TriggerOptions): Promise<number> {
  const client = makeClient(opts);
  const result = await client.testWebhookDelivery({ endpointId: opts.endpointId });
  emitJson({
    success: result.success,
    status_code: result.status_code ?? null,
    response_time_ms: result.response_time_ms ?? null,
    endpoint_url: result.endpoint_url ?? null,
    message: result.message ?? null,
    error: result.error ?? null,
  });
  return result.success ? 0 : 1;
}

// ---------------------------------------------------------------------------
// `webhooks fetch-sample` / `list-event-types`
// ---------------------------------------------------------------------------

interface FetchSampleOptions {
  eventType?: string;
  apiKey?: string;
  baseUrl?: string;
}

export async function runFetchSample(opts: FetchSampleOptions): Promise<void> {
  const client = makeClient(opts);
  const payload = await client.getWebhookSamplePayload({ eventType: opts.eventType });
  emitJson(payload);
}

interface ListEventTypesOptions {
  apiKey?: string;
  baseUrl?: string;
}

export async function runListEventTypes(opts: ListEventTypesOptions): Promise<void> {
  const client = makeClient(opts);
  const resp = await client.listWebhookEventTypes();
  const width = resp.event_types.reduce((acc, et) => Math.max(acc, et.event_type.length), 0);
  for (const et of resp.event_types) {
    emit(`${et.event_type.padEnd(width)}  ${et.description}`);
  }
}

// ---------------------------------------------------------------------------
// `webhooks endpoints {list,get,create,delete}`
// ---------------------------------------------------------------------------

interface EndpointsListOptions {
  page?: string;
  limit?: string;
  apiKey?: string;
  baseUrl?: string;
}

export async function runEndpointsList(opts: EndpointsListOptions): Promise<void> {
  const client = makeClient(opts);
  const page = opts.page ? Number.parseInt(opts.page, 10) : 1;
  const limit = opts.limit ? Number.parseInt(opts.limit, 10) : 25;
  const resp = await client.listWebhookEndpoints({ page, limit });
  emitJson({
    count: resp.count,
    results: resp.results,
  });
}

interface EndpointsCommonOptions {
  apiKey?: string;
  baseUrl?: string;
}

export async function runEndpointsGet(
  id: string,
  opts: EndpointsCommonOptions,
): Promise<void> {
  const client = makeClient(opts);
  const endpoint = await client.getWebhookEndpoint(id);
  emitJson(endpoint);
}

interface EndpointsCreateOptions extends EndpointsCommonOptions {
  url: string;
  name: string;
  inactive?: boolean;
}

export async function runEndpointsCreate(opts: EndpointsCreateOptions): Promise<void> {
  const client = makeClient(opts);
  const endpoint = await client.createWebhookEndpoint({
    name: opts.name,
    callback_url: opts.url,
    is_active: !opts.inactive,
  });
  emitJson(endpoint);
}

interface EndpointsDeleteOptions extends EndpointsCommonOptions {
  yes?: boolean;
}

export async function runEndpointsDelete(
  id: string,
  opts: EndpointsDeleteOptions,
): Promise<void> {
  if (!opts.yes) {
    // Non-interactive by design — match what's testable. Users get a clear
    // message; the Python CLI uses `click.confirm`, which prompts on stdin.
    // For Node we keep things simple: require --yes.
    emitErr(`Refusing to delete ${id} without --yes.`);
    process.exitCode = 1;
    return;
  }
  const client = makeClient(opts);
  await client.deleteWebhookEndpoint(id);
  emitJson({ deleted: id });
}

// ---------------------------------------------------------------------------
// CLI builder
// ---------------------------------------------------------------------------

/**
 * Build the commander program. Exported so tests can call `.parseAsync(...)`
 * directly without going through the bin shim.
 */
export function buildProgram(): Command {
  const program = new Command();
  program
    .name("tango-node")
    .description("Tango developer tooling (Node).")
    .showHelpAfterError();

  const webhooks = program
    .command("webhooks")
    .description("Receive, trigger, and simulate Tango webhook deliveries.");

  // --- listen ------------------------------------------------------------
  webhooks
    .command("listen")
    .description("Run a local receiver and stream deliveries to stdout.")
    .option("--port <port>", "TCP port to bind.", "8011")
    .option("--host <host>", "Bind address.", "127.0.0.1")
    .option("--path <path>", "URL path to accept deliveries on.", "/tango/webhooks")
    .option(
      "--secret <secret>",
      "Shared secret. Reads TANGO_WEBHOOK_SECRET if unset. " +
        "If empty, deliveries are accepted without signature verification.",
    )
    .option("--forward-to <url>", "Optional URL to mirror each delivery to.")
    .addOption(
      new Option("--require-signature", "Reject unsigned deliveries (default: when --secret set).")
        .conflicts("allowUnsigned"),
    )
    .addOption(
      new Option("--allow-unsigned", "Accept unsigned deliveries.").conflicts("requireSignature"),
    )
    .action(async (opts: ListenOptions & { allowUnsigned?: boolean }) => {
      let requireSignature: boolean | undefined = opts.requireSignature;
      if (opts.allowUnsigned) requireSignature = false;
      await runListen({ ...opts, requireSignature });
    });

  // --- simulate ----------------------------------------------------------
  withApiOptions(
    webhooks
      .command("simulate")
      .description("Sign a payload like Tango would. With --to, also POST it to a receiver.")
      .option(
        "--to <url>",
        "Receiver URL to POST to. If omitted, the signed request is printed but not sent.",
      )
      .option("--secret <secret>", "Shared secret (or TANGO_WEBHOOK_SECRET).")
      .option("--payload-file <path>", "Path to a JSON file with the body to send.")
      .option("--event-type <type>", "Fetch a canonical sample for this event type from Tango."),
  ).action(async (opts: SimulateOptions) => {
    const code = await runSimulate(opts);
    if (code !== 0) process.exit(code);
  });

  // --- trigger -----------------------------------------------------------
  withApiOptions(
    webhooks
      .command("trigger")
      .description("Ask Tango to send a real test delivery to your configured endpoint.")
      .option("--endpoint-id <id>", "Endpoint UUID. If omitted, the default endpoint is used."),
  ).action(async (opts: TriggerOptions) => {
    const code = await runTrigger(opts);
    if (code !== 0) process.exit(code);
  });

  // --- fetch-sample ------------------------------------------------------
  withApiOptions(
    webhooks
      .command("fetch-sample")
      .description("Print the canonical sample payload Tango emits for an event type.")
      .option("--event-type <type>", "Event type. Omit for the full samples mapping."),
  ).action(async (opts: FetchSampleOptions) => {
    await runFetchSample(opts);
  });

  // --- list-event-types --------------------------------------------------
  withApiOptions(
    webhooks
      .command("list-event-types")
      .description("List webhook event types Tango supports, with descriptions."),
  ).action(async (opts: ListEventTypesOptions) => {
    await runListEventTypes(opts);
  });

  // --- endpoints group ---------------------------------------------------
  const endpoints = webhooks
    .command("endpoints")
    .description("Manage webhook endpoints (where Tango delivers).");

  withApiOptions(
    endpoints
      .command("list")
      .description("List webhook endpoints configured for your account.")
      .option("--page <n>", "Page number.", "1")
      .option("--limit <n>", "Max per page (cap 100).", "25"),
  ).action(async (opts: EndpointsListOptions) => {
    await runEndpointsList(opts);
  });

  withApiOptions(
    endpoints
      .command("get")
      .description("Show one endpoint by id.")
      .argument("<id>", "Endpoint UUID."),
  ).action(async (id: string, opts: EndpointsCommonOptions) => {
    await runEndpointsGet(id, opts);
  });

  withApiOptions(
    endpoints
      .command("create")
      .description("Create a webhook endpoint. Output includes the generated secret — save it.")
      .requiredOption("--url <url>", "Receiver URL Tango will POST to.")
      .requiredOption(
        "--name <name>",
        "Human-readable name. Must be unique per account.",
      )
      .option("--inactive", "Create the endpoint disabled."),
  ).action(async (opts: EndpointsCreateOptions) => {
    await runEndpointsCreate(opts);
  });

  withApiOptions(
    endpoints
      .command("delete")
      .description("Delete a webhook endpoint.")
      .argument("<id>", "Endpoint UUID.")
      .option("--yes", "Skip the confirmation prompt."),
  ).action(async (id: string, opts: EndpointsDeleteOptions) => {
    await runEndpointsDelete(id, opts);
  });

  return program;
}

/**
 * Parse `argv` (defaults to `process.argv`) and execute the matched command.
 *
 * Exported for the bin shim and for tests.
 */
export async function main(argv?: readonly string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv ? [...argv] : process.argv);
}
