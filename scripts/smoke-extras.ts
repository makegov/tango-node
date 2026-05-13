/**
 * Live smoke test for the three SDK extras added in this branch:
 *
 *   1. Webhook signature helpers (generate/verify round-trip)
 *   2. Async iterator pagination (`iterateContracts` — first ~30 records)
 *   3. TANGO_BASE_URL env-var fallback (constructed without explicit baseUrl)
 *
 * Run with:
 *   npx tsx scripts/smoke-extras.ts
 * Or with a custom local host:
 *   TANGO_BASE_URL=http://localhost:8000 npx tsx scripts/smoke-extras.ts
 *
 * Exits 0 if all checks pass, non-zero otherwise.
 */

import { TangoClient } from "../src/client.js";
import { generateSignature, parseSignatureHeader, verifySignature } from "../src/webhooks/signing.js";

const BASE_URL = process.env.TANGO_BASE_URL ?? "http://localhost:8000";
const API_KEY = process.env.TANGO_API_KEY;
if (!API_KEY) {
  console.error("TANGO_API_KEY must be set in the environment");
  process.exit(1);
}

type StepResult = { name: string; ok: boolean; detail?: string };
const results: StepResult[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  // eslint-disable-next-line no-console
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function checkSigning(): Promise<void> {
  try {
    const body = '{"events":[{"event_type":"awards.created","piid":"ABC"}]}';
    const secret = "smoke-secret-rotating";
    const header = generateSignature(body, secret);

    if (!header.startsWith("sha256=")) {
      record("signature header format", false, `expected sha256= prefix, got: ${header}`);
      return;
    }
    record("signature header format", true, `len=${header.length}`);

    const parsed = parseSignatureHeader(header);
    if (!parsed || parsed.algorithm !== "sha256" || !parsed.signature) {
      record("parseSignatureHeader", false, `unexpected parse: ${JSON.stringify(parsed)}`);
      return;
    }
    record("parseSignatureHeader", true, `algorithm=${parsed.algorithm} sig=${parsed.signature.slice(0, 8)}…`);

    const verified = verifySignature(body, header, secret);
    record("verifySignature round-trip", verified, verified ? "ok" : "verify returned false");

    const tampered = verifySignature(body + "X", header, secret);
    record("verifySignature rejects tampered body", tampered === false, `result=${tampered}`);

    const wrongSecret = verifySignature(body, header, "different-secret");
    record("verifySignature rejects wrong secret", wrongSecret === false, `result=${wrongSecret}`);
  } catch (err) {
    record("signature checks", false, err instanceof Error ? err.message : String(err));
  }
}

async function checkIterator(): Promise<void> {
  const client = new TangoClient({
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    timeoutMs: 15_000,
    retries: 0,
  });

  // Aim for ~30 records across at most 2 pages (limit=20 -> at most 2 pages).
  const TARGET = 30;
  const MAX_PAGES_SEEN = 4; // safety belt; we expect 2

  let seen = 0;
  let pageTransitionsSeen = 0; // crude proxy: count requests by tracking limit chunks

  try {
    const iter = client.iterateContracts({ limit: 20 });
    let lastBatchStart = 0;
    for await (const _contract of iter) {
      seen += 1;
      if (seen - lastBatchStart > 20) {
        pageTransitionsSeen += 1;
        lastBatchStart = seen;
      }
      if (seen >= TARGET) break;
      if (pageTransitionsSeen >= MAX_PAGES_SEEN) {
        record("iterateContracts safety belt", false, `exceeded ${MAX_PAGES_SEEN} page transitions`);
        return;
      }
    }
    record("iterateContracts yields records", seen > 0, `yielded ${seen} (target ${TARGET})`);
    record(
      "iterateContracts honored break",
      seen <= TARGET,
      `seen=${seen} ≤ ${TARGET}`,
    );
  } catch (err) {
    record("iterateContracts", false, err instanceof Error ? err.message : String(err));
  }
}

function checkBaseUrlFallback(): Promise<void> {
  // Construct a client with NO explicit baseUrl while TANGO_BASE_URL is set
  // to BASE_URL. Then issue a request and inspect the URL the SDK actually
  // builds, via a custom fetchImpl that captures it.
  return new Promise((resolve) => {
    const origEnv = process.env.TANGO_BASE_URL;
    process.env.TANGO_BASE_URL = BASE_URL;

    let captured: string | null = null;
    const fetchImpl = (async (url: string | URL): Promise<unknown> => {
      captured = String(url);
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ count: 0, next: null, previous: null, results: [] });
        },
      };
    }) as unknown as typeof fetch;

    const client = new TangoClient({
      apiKey: API_KEY,
      fetchImpl,
      retries: 0,
    });

    client
      .listAgencies()
      .then(() => {
        if (origEnv === undefined) {
          delete process.env.TANGO_BASE_URL;
        } else {
          process.env.TANGO_BASE_URL = origEnv;
        }

        if (!captured) {
          record("TANGO_BASE_URL env fallback", false, "no request was made");
        } else if (!captured.startsWith(BASE_URL)) {
          record("TANGO_BASE_URL env fallback", false, `captured=${captured}, expected prefix ${BASE_URL}`);
        } else {
          record("TANGO_BASE_URL env fallback", true, `captured ${captured}`);
        }
        resolve();
      })
      .catch((err) => {
        if (origEnv === undefined) delete process.env.TANGO_BASE_URL;
        else process.env.TANGO_BASE_URL = origEnv;
        record("TANGO_BASE_URL env fallback", false, err instanceof Error ? err.message : String(err));
        resolve();
      });
  });
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Smoke-extras starting (BASE_URL=${BASE_URL})\n`);

  // 1. Signing — no network needed.
  await checkSigning();

  // 2. Iterator — hits live API. Only runs if reachable.
  await checkIterator();

  // 3. Env var fallback — synthetic fetch, no network.
  await checkBaseUrlFallback();

  // eslint-disable-next-line no-console
  console.log("");
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  // eslint-disable-next-line no-console
  console.log(`Smoke summary: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Smoke crashed:", err);
  process.exitCode = 1;
});
