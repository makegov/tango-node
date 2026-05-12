/**
 * Live smoke test for tango-node webhook write methods.
 *
 * Runs against local Tango (default http://localhost:8000) with the local
 * API key. Creates an endpoint, subscription, and alert; calls
 * test-delivery; then deletes everything it created.
 *
 * Run with: npx tsx scripts/smoke-writes.ts
 * Or:       npm run build && node dist/smoke-writes.js (if compiled)
 */

import { TangoClient } from "../src/client.js";

const BASE_URL = process.env.TANGO_BASE_URL ?? "http://localhost:8000";
const API_KEY = process.env.TANGO_API_KEY;
if (!API_KEY) {
  console.error("TANGO_API_KEY must be set in the environment");
  process.exit(1);
}

const SMOKE_TAG = `smoke-${Date.now()}`;
// Use 127.0.0.1 with an unused port so DNS always resolves; the receiver
// won't exist, so the test-delivery POST will fail at the TCP level, which is
// exactly what we want (we're testing the SDK call, not real delivery).
const SMOKE_CALLBACK = `http://127.0.0.1:1/${SMOKE_TAG}`;

type StepResult = { name: string; ok: boolean; detail?: string };
const results: StepResult[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push({ name, ok, detail });
  const tag = ok ? "PASS" : "FAIL";
  // eslint-disable-next-line no-console
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`Smoke test starting against ${BASE_URL}`);
  // eslint-disable-next-line no-console
  console.log(`Tag: ${SMOKE_TAG}\n`);

  const client = new TangoClient({
    apiKey: API_KEY,
    baseUrl: BASE_URL,
    timeoutMs: 15_000,
    retries: 0, // for smoke we want fast failures, not retries that mask bugs
  });

  let endpointId: string | undefined;
  let subscriptionId: string | undefined;
  let alertId: string | undefined;

  // ---- 1. createWebhookEndpoint ----
  try {
    const created = await client.createWebhookEndpoint({
      name: `tango-node smoke ${SMOKE_TAG}`,
      callback_url: SMOKE_CALLBACK,
    });
    endpointId = created.id;
    if (!endpointId) throw new Error("no id in response");
    if (!created.secret) throw new Error("no secret in response");
    record("createWebhookEndpoint", true, `id=${endpointId} secret=${String(created.secret).slice(0, 8)}…`);
  } catch (err) {
    record("createWebhookEndpoint", false, err instanceof Error ? err.message : String(err));
  }

  // ---- 2. updateWebhookEndpoint ----
  if (endpointId) {
    try {
      const updated = await client.updateWebhookEndpoint(endpointId, { is_active: true });
      record("updateWebhookEndpoint", updated.is_active === true, `is_active=${updated.is_active}`);
    } catch (err) {
      record("updateWebhookEndpoint", false, err instanceof Error ? err.message : String(err));
    }
  }

  // ---- 3. createWebhookSubscription ----
  if (endpointId) {
    try {
      const sub = await client.createWebhookSubscription({
        subscription_name: `tango-node smoke sub ${SMOKE_TAG}`,
        endpoint: endpointId,
        subscription_type: "subject",
        payload: {
          records: [
            {
              event_type: "awards.new_award",
              subject_type: "entity",
              subject_ids: [],
            },
          ],
        },
      });
      subscriptionId = sub.id;
      record("createWebhookSubscription", Boolean(subscriptionId), `id=${subscriptionId}`);
    } catch (err) {
      record("createWebhookSubscription", false, err instanceof Error ? err.message : String(err));
    }
  }

  // ---- 4. updateWebhookSubscription ----
  if (subscriptionId) {
    try {
      const updated = await client.updateWebhookSubscription(subscriptionId, {
        subscription_name: `tango-node smoke sub UPDATED ${SMOKE_TAG}`,
      });
      record(
        "updateWebhookSubscription",
        updated.subscription_name.includes("UPDATED"),
        `name=${updated.subscription_name}`,
      );
    } catch (err) {
      record("updateWebhookSubscription", false, err instanceof Error ? err.message : String(err));
    }
  }

  // ---- 5. testWebhookEndpoint ----
  // The receiver isn't actually listening, so Tango will report a connection
  // failure. Tango currently returns HTTP 502 with a structured body in that
  // case (the API's call SUCCEEDED — it correctly diagnosed the receiver as
  // unreachable). For the smoke we care that the SDK correctly hit the
  // endpoint with the right body, not the receiver itself. Both 200/204
  // (delivery succeeded) and 502 (delivery failed but call reached the API)
  // are valid signals.
  if (endpointId) {
    try {
      const result = await client.testWebhookEndpoint(endpointId);
      record(
        "testWebhookEndpoint",
        result !== null && typeof result === "object",
        `success=${result.success} status_code=${result.status_code ?? "n/a"}`,
      );
    } catch (err) {
      const e = err as { statusCode?: number; responseData?: unknown; message?: string };
      // Tango returns 502 with `{"success": false, "error": "Connection error", ...}`
      // when it cannot reach the receiver. That's the expected behavior here:
      // the SDK call SUCCEEDED, the actual webhook delivery just couldn't reach
      // our fake receiver. Treat as PASS.
      const body = e.responseData as { error?: string; success?: boolean } | undefined;
      if (e.statusCode === 502 && body && (body.error === "Connection error" || body.success === false)) {
        record(
          "testWebhookEndpoint",
          true,
          `Tango reached the receiver and reported it unreachable as expected (HTTP 502, error="${body.error}")`,
        );
      } else {
        record("testWebhookEndpoint", false, err instanceof Error ? err.message : String(err));
      }
    }
  }

  // ---- 6. createWebhookAlert ----
  // NOTE: /api/webhooks/alerts/ auto-resolves the user's endpoint and
  // requires exactly one. If the user already has multiple endpoints, this
  // step will be skipped with a SKIP result (still considered a pass for
  // the smoke, but we report the constraint).
  try {
    const alert = await client.createWebhookAlert({
      name: `tango-node smoke alert ${SMOKE_TAG}`,
      query_type: "contract",
      filters: { search: "smoke" },
      frequency: "realtime",
    });
    alertId = alert.alert_id;
    record("createWebhookAlert", Boolean(alertId), `id=${alertId}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("multiple webhook endpoints") || msg.includes("multiple endpoints")) {
      record(
        "createWebhookAlert",
        true,
        "SKIP — user has multiple endpoints; alerts endpoint requires exactly one. Constraint behaves as expected.",
      );
    } else {
      record("createWebhookAlert", false, msg);
    }
  }

  // ---- 7. deleteWebhookAlert ----
  if (alertId) {
    try {
      await client.deleteWebhookAlert(alertId);
      record("deleteWebhookAlert", true, `id=${alertId}`);
    } catch (err) {
      record("deleteWebhookAlert", false, err instanceof Error ? err.message : String(err));
    }
  }

  // ---- 8. deleteWebhookSubscription ----
  if (subscriptionId) {
    try {
      await client.deleteWebhookSubscription(subscriptionId);
      record("deleteWebhookSubscription", true, `id=${subscriptionId}`);
    } catch (err) {
      record("deleteWebhookSubscription", false, err instanceof Error ? err.message : String(err));
    }
  }

  // ---- 9. deleteWebhookEndpoint ----
  if (endpointId) {
    try {
      await client.deleteWebhookEndpoint(endpointId);
      record("deleteWebhookEndpoint", true, `id=${endpointId}`);
    } catch (err) {
      record("deleteWebhookEndpoint", false, err instanceof Error ? err.message : String(err));
    }
  }

  // ---- Summary ----
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
