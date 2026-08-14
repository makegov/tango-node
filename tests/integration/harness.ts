/**
 * Record/replay cassette harness around the SDK's injectable `fetchImpl` — the node equivalent of tango-python's VCR setup (tests/integration/conftest.py).
 *
 * Modes (mirroring python's `vcr_config`):
 * - default: replay-only from `tests/cassettes/*.json`; a missing cassette is a hard failure so drift is loud (record_mode="none" semantics).
 * - `TANGO_REFRESH_CASSETTES=true`: re-record against the live API (requires `TANGO_API_KEY`; record_mode="all" semantics).
 * - `TANGO_USE_LIVE_API=true`: bypass cassettes entirely and hit the live API.
 *
 * Cassettes store only `{method, url}` per request (never request headers, so the API key cannot be serialized) and a small allowlisted subset of response headers.
 * Matching is method + path + sorted query, host-insensitive.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe } from "vitest";

import { TangoClient } from "../../src/client.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const CASSETTE_DIR = path.resolve(HERE, "..", "cassettes");

export const REFRESH_CASSETTES = process.env.TANGO_REFRESH_CASSETTES === "true";
export const USE_LIVE_API = process.env.TANGO_USE_LIVE_API === "true";
export const REPLAY_ONLY = !REFRESH_CASSETTES && !USE_LIVE_API;

/** Spacing between recorded live requests, to stay well under rate limits. */
const RECORD_SPACING_MS = 400;

/** Response headers worth keeping in a cassette. Everything else is dropped. */
const RESPONSE_HEADER_ALLOWLIST = /^(content-type|retry-after|x-ratelimit-.*|x-tango-api-version)$/i;

/** Header names that must never be serialized, even if they somehow appear. */
const SENSITIVE_HEADERS = /^(x-api-key|authorization|proxy-authorization|cookie|set-cookie)$/i;

export interface RecordedInteraction {
  request: { method: string; url: string };
  /** `bodyKind` discriminates replay encoding; absent means `"json"`, so every pre-existing cassette (all JSON bodies) stays valid. */
  response: { status: number; headers: Record<string, string>; body: unknown; bodyKind?: "json" | "text" };
}

interface Cassette {
  version: 1;
  interactions: RecordedInteraction[];
}

/** Canonical match key: method + path + sorted query. Host is ignored so a `TANGO_BASE_URL` override cannot break replay. */
export function matchKey(method: string, url: string): string {
  const u = new URL(url, "https://_/");
  const params = [...u.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = params.map(([k, v]) => `${k}=${v}`).join("&");
  return `${method.toUpperCase()} ${u.pathname}${query ? `?${query}` : ""}`;
}

function sortedUrl(url: string): string {
  const u = new URL(url);
  const params = [...u.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const search = new URLSearchParams(params).toString();
  return `${u.origin}${u.pathname}${search ? `?${search}` : ""}`;
}

/**
 * Build the storable form of one interaction.
 * Request headers are dropped entirely; response headers are reduced to the allowlist with sensitive names refused outright; and if `secret` is given, any appearance of it anywhere in the serialized output throws instead of writing.
 */
export function serializeInteraction(
  method: string,
  url: string,
  status: number,
  responseHeaders: Record<string, string>,
  body: unknown,
  secret?: string | null,
  bodyKind: "json" | "text" = "json",
): RecordedInteraction {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(responseHeaders)) {
    if (SENSITIVE_HEADERS.test(name)) continue;
    if (RESPONSE_HEADER_ALLOWLIST.test(name)) headers[name.toLowerCase()] = value;
  }

  const interaction: RecordedInteraction = {
    request: { method: method.toUpperCase(), url: sortedUrl(url) },
    // `bodyKind` is only written for text bodies, keeping JSON cassettes on the original schema.
    response: bodyKind === "text" ? { status, headers, body, bodyKind } : { status, headers, body },
  };

  if (secret) {
    const json = JSON.stringify(interaction);
    if (json.includes(secret)) {
      throw new Error("Refusing to serialize cassette interaction: API key material found in payload");
    }
  }

  return interaction;
}

function cassettePath(name: string): string {
  return path.join(CASSETTE_DIR, `${name}.json`);
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireApiKey(): string {
  const key = process.env.TANGO_API_KEY;
  if (!key) {
    throw new Error("TANGO_API_KEY is required for TANGO_REFRESH_CASSETTES / TANGO_USE_LIVE_API runs");
  }
  return key;
}

function recordingFetch(name: string): typeof fetch {
  const secret = requireApiKey();
  mkdirSync(CASSETTE_DIR, { recursive: true });
  const interactions: RecordedInteraction[] = [];

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    await sleep(RECORD_SPACING_MS);
    const res = await fetch(input, init);

    // Retryable statuses are not persisted: the SDK retries them, and only the settled outcome belongs in the cassette.
    if (res.status === 429 || res.status >= 500) return res;

    const text = await res.clone().text();
    let body: unknown = null;
    let bodyKind: "json" | "text" = "json";
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON payload: store the raw text so replay can be byte-faithful.
      body = text;
      bodyKind = "text";
    }

    const method = init?.method ?? "GET";
    interactions.push(serializeInteraction(method, String(input), res.status, headersToRecord(res.headers), body, secret, bodyKind));
    writeFileSync(cassettePath(name), `${JSON.stringify({ version: 1, interactions } satisfies Cassette, null, 2)}\n`);
    return res;
  }) as typeof fetch;
}

function replayFetch(name: string): typeof fetch {
  const file = cassettePath(name);
  if (!existsSync(file)) {
    throw new Error(
      `Missing cassette ${path.relative(process.cwd(), file)} — the recorded corpus has drifted from the tests. ` +
        "Re-record with TANGO_REFRESH_CASSETTES=true TANGO_API_KEY=... npx vitest run tests/integration",
    );
  }

  const cassette = JSON.parse(readFileSync(file, "utf8")) as Cassette;
  const remaining = [...cassette.interactions];

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const key = matchKey(method, String(input));
    const idx = remaining.findIndex((i) => matchKey(i.request.method, i.request.url) === key);
    if (idx === -1) {
      const recorded = cassette.interactions.map((i) => matchKey(i.request.method, i.request.url)).join("\n  ");
      throw new Error(`No recorded interaction in ${name}.json for:\n  ${key}\nRecorded:\n  ${recorded}\nRe-record with TANGO_REFRESH_CASSETTES=true.`);
    }
    const [hit] = remaining.splice(idx, 1);
    return responseFromRecorded(hit);
  }) as typeof fetch;
}

/** Rebuild the wire Response for a recorded interaction: text bodies replay verbatim; JSON bodies re-serialize (the pre-`bodyKind` behavior). */
export function responseFromRecorded(interaction: RecordedInteraction): Response {
  const { status, headers, body, bodyKind } = interaction.response;
  const raw = bodyKind === "text" ? String(body) : JSON.stringify(body);
  return new Response(raw, { status, headers });
}

/** Cassette-aware fetch for one test: records, replays, or passes through per mode. */
export function cassetteFetch(name: string): typeof fetch {
  if (USE_LIVE_API) return fetch;
  if (REFRESH_CASSETTES) return recordingFetch(name);
  return replayFetch(name);
}

/** A TangoClient wired to `cassetteFetch(name)` with mode-appropriate auth and retries. */
export function integrationClient(name: string): TangoClient {
  if (REPLAY_ONLY) {
    // Zero retries: a replay mismatch or replayed 429 should fail fast, not back off.
    return new TangoClient({ apiKey: "test-key-for-cassettes", fetchImpl: cassetteFetch(name), retries: 0 });
  }
  return new TangoClient({ apiKey: requireApiKey(), fetchImpl: cassetteFetch(name) });
}

/**
 * True when the suite can run at all: always in record/live mode, and only when the cassettes directory exists in replay mode.
 * An absent directory (a fork without the corpus) skips the whole suite; a missing individual file inside an existing directory still hard-fails.
 */
export function cassettesAvailable(): boolean {
  return !REPLAY_ONLY || existsSync(CASSETTE_DIR);
}

if (!cassettesAvailable()) {
  console.warn("tests/cassettes/ not found — integration suite skipped (record it with TANGO_REFRESH_CASSETTES=true)");
}

/** `describe` that skips the whole suite when no cassette corpus is present. */
export const describeIntegration = describe.skipIf(!cassettesAvailable());
