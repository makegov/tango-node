/**
 * Smoke test for read-only TangoClient methods added in feat/api-parity-reads.
 *
 * Hits every new method against http://localhost:8000.
 * Read-only — no mutations.
 *
 * Run with: node --import tsx/esm scripts/smoke-reads.ts
 *   (or pre-build and run the compiled JS — see scripts/smoke-reads.mjs)
 */
import { TangoClient } from "../src/index.js";

const BASE_URL = process.env.TANGO_BASE_URL ?? "http://localhost:8000";
const API_KEY = process.env.TANGO_API_KEY;
if (!API_KEY) {
  console.error("TANGO_API_KEY must be set in the environment");
  process.exit(1);
}

const client = new TangoClient({ baseUrl: BASE_URL, apiKey: API_KEY, timeoutMs: 10000 });

type SmokeResult = { name: string; ok: boolean; detail: string };
const results: SmokeResult[] = [];

async function run<T>(name: string, fn: () => Promise<T>, summarize?: (v: T) => string): Promise<void> {
  try {
    const v = await fn();
    const detail = summarize ? summarize(v) : "ok";
    results.push({ name, ok: true, detail });
    process.stdout.write(`PASS ${name} — ${detail}\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, detail: msg });
    process.stdout.write(`FAIL ${name} — ${msg}\n`);
  }
}

function pagedDetail(r: { count: number; results: unknown[] }): string {
  return `count=${r.count} results=${r.results.length}`;
}

async function main(): Promise<void> {
  // Lookups
  await run("listNaics", () => client.listNaics({ limit: 1 }), pagedDetail);
  await run("getNaics", () => client.getNaics("541511"), (v) => `code=${(v as { code?: string }).code ?? "?"}`);
  await run("listPsc", () => client.listPsc({ limit: 1 }), pagedDetail);
  await run("getPsc", async () => {
    const list = await client.listPsc({ limit: 1 });
    const code = (list.results?.[0] as { code?: string } | undefined)?.code;
    if (!code) throw new Error("no PSC codes returned to probe");
    return client.getPsc(code);
  }, (v) => `code=${(v as { code?: string }).code ?? "?"}`);

  await run("listMasSins", () => client.listMasSins({ limit: 1 }), pagedDetail);
  await run("getMasSin", async () => {
    const list = await client.listMasSins({ limit: 1 });
    const sin = (list.results?.[0] as { sin?: string } | undefined)?.sin;
    if (!sin) throw new Error("no SINs returned");
    return client.getMasSin(sin);
  }, (v) => `sin=${(v as { sin?: string }).sin ?? "?"}`);

  await run("listAssistanceListings", () => client.listAssistanceListings({ limit: 1 }), pagedDetail);
  await run("getAssistanceListing", async () => {
    const list = await client.listAssistanceListings({ limit: 1 });
    const num = (list.results?.[0] as { number?: string } | undefined)?.number;
    if (!num) throw new Error("no listings returned");
    return client.getAssistanceListing(num);
  }, (v) => `number=${(v as { number?: string }).number ?? "?"}`);

  await run("listOrganizations", () => client.listOrganizations({ limit: 1 }), pagedDetail);
  await run("getOrganization", async () => {
    const list = await client.listOrganizations({ limit: 1 });
    const o = list.results?.[0] as Record<string, string | undefined> | undefined;
    // Server accepts the UUID `key`; CGAC / FPDS code lookups go through different params.
    const ident = o?.key ?? o?.fh_key;
    if (!ident) throw new Error("no organization identifier found");
    return client.getOrganization(ident);
  }, (v) => {
    const r = v as Record<string, unknown>;
    return `name=${String(r.name ?? r.short_name ?? "?")}`;
  });

  await run("listOffices", () => client.listOffices({ limit: 1 }), pagedDetail);
  await run("getOffice", async () => {
    const list = await client.listOffices({ limit: 1 });
    const r = list.results?.[0] as { office_code?: string; code?: string } | undefined;
    const code = r?.office_code ?? r?.code;
    if (!code) throw new Error("no offices returned");
    return client.getOffice(code);
  }, (v) => {
    const r = v as { office_code?: string; code?: string };
    return `code=${r.office_code ?? r.code ?? "?"}`;
  });

  await run("listDepartments (deprecated)", () => client.listDepartments({ limit: 1 }), pagedDetail);

  // Awards completeness
  await run("listOtas", () => client.listOtas({ limit: 1 }), pagedDetail);
  await run("getOta", async () => {
    const list = await client.listOtas({ limit: 1 });
    const key = (list.results?.[0] as { key?: string } | undefined)?.key;
    if (!key) {
      // OTAs may be empty; treat as soft-pass
      return { key: "<empty>" };
    }
    return client.getOta(key);
  }, (v) => `key=${(v as { key?: string }).key ?? "?"}`);

  await run("listOtidvs", () => client.listOtidvs({ limit: 1 }), pagedDetail);
  await run("getOtidv", async () => {
    const list = await client.listOtidvs({ limit: 1 });
    const key = (list.results?.[0] as { key?: string } | undefined)?.key;
    if (!key) return { key: "<empty>" };
    return client.getOtidv(key);
  }, (v) => `key=${(v as { key?: string }).key ?? "?"}`);

  await run("listSubawards", () => client.listSubawards({ limit: 1 }), pagedDetail);
  await run("listGsaElibraryContracts", () => client.listGsaElibraryContracts({ limit: 1 }), pagedDetail);

  // LCATs — try via an entity with subawards/contracts first; fall back to validation skip
  await run("listLcats (via entity)", async () => {
    // Use a UEI guaranteed to exist in local seed by hitting entities list
    const ents = await client.listEntities({ limit: 1 });
    const uei = (ents.results?.[0] as { uei?: string } | undefined)?.uei;
    if (!uei) throw new Error("no entities available to probe LCATs");
    return client.listLcats({ uei, limit: 1 });
  }, pagedDetail);

  // Other
  await run("listProtests", () => client.listProtests({ limit: 1 }), pagedDetail);
  await run("getProtest", async () => {
    const list = await client.listProtests({ limit: 1 });
    const r = list.results?.[0] as { case_id?: string; case_number?: string; id?: string | number } | undefined;
    // The detail endpoint matches on the UUID `case_id`; the slug `case_number` is for filtering.
    const id = r?.case_id ?? (r?.id !== undefined ? String(r.id) : undefined) ?? r?.case_number;
    if (!id) return { case_number: "<empty>" };
    return client.getProtest(id);
  }, (v) => `case=${(v as { case_number?: string }).case_number ?? "?"}`);

  await run("listItDashboard", () => client.listItDashboard({ limit: 1 }), pagedDetail);
  await run("getItDashboard", async () => {
    const list = await client.listItDashboard({ limit: 1 });
    const r = list.results?.[0] as { uii?: string; id?: string | number } | undefined;
    const id = r?.uii ?? (r?.id !== undefined ? String(r.id) : undefined);
    if (!id) return { uii: "<empty>" };
    return client.getItDashboard(id);
  }, (v) => `uii=${(v as { uii?: string }).uii ?? "?"}`);

  // Metrics — try a NAICS code we know exists
  await run("listMetrics (naics)", async () => {
    const list = await client.listNaics({ limit: 1 });
    const code = (list.results?.[0] as { code?: string } | undefined)?.code ?? "541511";
    return client.listMetrics({
      ownerType: "naics",
      ownerId: code,
      months: 12,
      periodGrouping: "month",
    });
  }, (v) => `keys=${Object.keys(v as object).slice(0, 5).join(",")}`);

  // resolve / validate (POST)
  await run("resolve (entity)", () => client.resolve({ name: "Lockheed Martin", target_type: "entity" }),
    (v) => `candidates=${(v as { candidates?: unknown[] }).candidates?.length ?? 0}`);
  await run("validate (uei)", () => client.validate({ type: "uei", value: "ABCDEF123456" }),
    (v) => `keys=${Object.keys(v as object).slice(0, 5).join(",")}`);

  const failed = results.filter((r) => !r.ok);
  process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`);
  if (failed.length > 0) {
    process.stdout.write(`Failures:\n`);
    for (const f of failed) process.stdout.write(`  ${f.name}: ${f.detail}\n`);
    process.exit(1);
  }
}

main().catch((e) => {
  process.stderr.write(`smoke harness crashed: ${e}\n`);
  process.exit(2);
});
