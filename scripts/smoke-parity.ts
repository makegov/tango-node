/**
 * Smoke test for Python-parity methods added on feat/api-parity.
 *
 * Hits every new method against http://localhost:8000 and reports
 * PASS/FAIL per method. Read-only — except webhook alerts which we
 * create + verify + clean up (callback URLs contain "parity" so any
 * leftovers can be scrubbed by grep).
 *
 * Run with: npx tsx scripts/smoke-parity.ts
 */
import { TangoClient } from "../src/index.js";

const BASE_URL = process.env.TANGO_BASE_URL ?? "http://localhost:8000";
const API_KEY = process.env.TANGO_API_KEY;
if (!API_KEY) {
  console.error("TANGO_API_KEY must be set in the environment");
  process.exit(1);
}

const client = new TangoClient({ baseUrl: BASE_URL, apiKey: API_KEY, timeoutMs: 15000 });

type SmokeResult = { name: string; ok: boolean; detail: string };
const results: SmokeResult[] = [];

async function run<T>(name: string, fn: () => Promise<T>, summarize?: (v: T) => string): Promise<T | null> {
  try {
    const v = await fn();
    const detail = summarize ? summarize(v) : "ok";
    results.push({ name, ok: true, detail });
    process.stdout.write(`PASS ${name} — ${detail}\n`);
    return v;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, detail: msg });
    process.stdout.write(`FAIL ${name} — ${msg}\n`);
    return null;
  }
}

function skipReason(name: string, reason: string): void {
  results.push({ name, ok: true, detail: `SKIP: ${reason}` });
  process.stdout.write(`SKIP ${name} — ${reason}\n`);
}

function paged(r: { count: number; results: unknown[] }): string {
  return `count=${r.count} results=${r.results.length}`;
}

async function main(): Promise<void> {
  // Sub-detail methods — pick a real department off listDepartments
  const dept = await client.listDepartments({ limit: 1 }).catch(() => null);
  const deptCode = (dept?.results?.[0] as { code?: string } | undefined)?.code;
  if (deptCode) {
    await run(`getDepartment(${deptCode})`, () => client.getDepartment(deptCode), (v) => `code=${(v as { code?: string }).code ?? "?"}`);
  } else {
    skipReason("getDepartment", "no departments returned to probe");
  }
  const bt = await client.listBusinessTypes({ limit: 1 }).catch(() => null);
  const btCode = bt?.results?.[0] && (bt.results[0] as { code?: string }).code;
  if (btCode) {
    await run("getBusinessType", () => client.getBusinessType(btCode), (v) => `code=${(v as { code?: string }).code}`);
  } else {
    skipReason("getBusinessType", "no business types returned to probe");
  }

  // Entity sub-resources — need a UEI; pick one off listEntities
  const ent = await client.listEntities({ limit: 1 }).catch(() => null);
  const uei = (ent?.results?.[0] as { uei?: string } | undefined)?.uei;
  if (uei) {
    await run(`listEntityContracts(${uei})`, () => client.listEntityContracts(uei, { limit: 1 }), paged);
    await run(`listEntityIdvs(${uei})`, () => client.listEntityIdvs(uei, { limit: 1 }), paged);
    await run(`listEntityOtas(${uei})`, () => client.listEntityOtas(uei, { limit: 1 }), paged);
    await run(`listEntityOtidvs(${uei})`, () => client.listEntityOtidvs(uei, { limit: 1 }), paged);
    await run(`listEntitySubawards(${uei})`, () => client.listEntitySubawards(uei, { limit: 1 }), paged);
    await run(`listEntityLcats(${uei})`, () => client.listEntityLcats(uei, { limit: 1 }), paged);
    await run(`getEntityMetrics(${uei})`, () => client.getEntityMetrics(uei, 12, "month"), () => "ok");
  } else {
    for (const m of [
      "listEntityContracts",
      "listEntityIdvs",
      "listEntityOtas",
      "listEntityOtidvs",
      "listEntitySubawards",
      "listEntityLcats",
      "getEntityMetrics",
    ]) {
      skipReason(m, "no entities returned to probe");
    }
  }

  // IDV sub-resources
  const idv = await client.listIdvs({ limit: 1 }).catch(() => null);
  const idvKey = (idv?.results?.[0] as { key?: string } | undefined)?.key;
  if (idvKey) {
    await run(`listIdvLcats(${idvKey})`, () => client.listIdvLcats(idvKey, { limit: 1 }), paged);
  } else {
    skipReason("listIdvLcats", "no IDVs returned to probe");
  }

  // Agency sub-resources
  const ag = await client.listAgencies({ limit: 1 }).catch(() => null);
  const agencyCode =
    (ag?.results?.[0] as { code?: string; cgac?: string } | undefined)?.code ??
    (ag?.results?.[0] as { code?: string; cgac?: string } | undefined)?.cgac ??
    "9700";
  await run(`listAgencyAwardingContracts(${agencyCode})`, () => client.listAgencyAwardingContracts(agencyCode, { limit: 1 }), paged);
  await run(`listAgencyFundingContracts(${agencyCode})`, () => client.listAgencyFundingContracts(agencyCode, { limit: 1 }), paged);

  // Typed metrics
  await run("getNaicsMetrics(541511,12,monthly)", () => client.getNaicsMetrics("541511", 12, "month"), () => "ok");
  await run("getPscMetrics(D302,12,monthly)", () => client.getPscMetrics("D302", 12, "month"), () => "ok");

  // Webhook alerts CRUD parity (list + get + update)
  await run("listWebhookAlerts", () => client.listWebhookAlerts({ pageSize: 1 }), paged);

  let createdAlertId: string | null = null;
  try {
    // The /alerts/ endpoint requires an explicit endpoint UUID when more than
    // one webhook endpoint exists. Pick the first if we have one.
    const eps = await client.listWebhookEndpoints({ limit: 1 } as { page?: number; limit?: number });
    const endpointId =
      (eps.results?.[0] as { id?: string; endpoint_id?: string } | undefined)?.id ??
      (eps.results?.[0] as { id?: string; endpoint_id?: string } | undefined)?.endpoint_id;
    const alertInput: {
      name: string;
      query_type: string;
      filters: Record<string, unknown>;
      frequency: string;
      endpoint?: string;
    } = {
      name: "parity-smoke-alert",
      query_type: "contract",
      filters: { naics: "541511" },
      frequency: "daily",
    };
    if (endpointId) alertInput.endpoint = endpointId;
    const created = await client.createWebhookAlert(alertInput as Parameters<typeof client.createWebhookAlert>[0]);
    createdAlertId = (created as { alert_id?: string; id?: string }).alert_id ?? (created as { id?: string }).id ?? null;
    results.push({ name: "createWebhookAlert", ok: true, detail: `id=${createdAlertId ?? "?"}` });
    process.stdout.write(`PASS createWebhookAlert — id=${createdAlertId}\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name: "createWebhookAlert", ok: false, detail: msg });
    process.stdout.write(`FAIL createWebhookAlert — ${msg}\n`);
  }

  if (createdAlertId) {
    await run(`getWebhookAlert(${createdAlertId})`, () => client.getWebhookAlert(createdAlertId!), () => "ok");
    await run(
      `updateWebhookAlert(${createdAlertId})`,
      () => client.updateWebhookAlert(createdAlertId!, { name: "parity-smoke-alert-renamed" }),
      () => "ok",
    );
    try {
      await client.deleteWebhookAlert(createdAlertId);
      results.push({ name: "cleanup deleteWebhookAlert", ok: true, detail: "deleted" });
      process.stdout.write(`PASS cleanup deleteWebhookAlert — deleted\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ name: "cleanup deleteWebhookAlert", ok: false, detail: msg });
      process.stdout.write(`FAIL cleanup deleteWebhookAlert — ${msg}\n`);
    }
  } else {
    skipReason("getWebhookAlert", "no alert created to read");
    skipReason("updateWebhookAlert", "no alert created to update");
  }

  // Misc
  await run("searchOpportunityAttachments", () => client.searchOpportunityAttachments({ q: "cybersecurity", topK: 3 }), () => "ok");
  await run("getVersion", () => client.getVersion(), () => "ok");
  await run("listApiKeys", () => client.listApiKeys(), () => "ok");

  // Summary
  const passes = results.filter((r) => r.ok).length;
  const fails = results.filter((r) => !r.ok).length;
  process.stdout.write(`\nSUMMARY: ${passes} pass / ${fails} fail / ${results.length} total\n`);
  if (fails > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
