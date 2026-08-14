/**
 * Production smoke suite — the node port of tango-python's tests/production/.
 *
 * Runs ONLY when `TANGO_LIVE_TESTS=true` and `TANGO_API_KEY` are both set; it is excluded from default runs and CI by vitest.config.ts, and this gate is a second belt in case the file is targeted directly.
 * Light invariants only: status, pagination shape, and rate-limit header parsing.
 *
 *   TANGO_LIVE_TESTS=true TANGO_API_KEY=... npx vitest run tests/production
 */

import { TangoClient } from "../../src/client.js";
import { expectFields, expectNonEmpty, expectPagination } from "../integration/validation.js";

const LIVE = process.env.TANGO_LIVE_TESTS === "true" && Boolean(process.env.TANGO_API_KEY);

function productionClient(): TangoClient {
  return new TangoClient({ apiKey: process.env.TANGO_API_KEY });
}

describe.skipIf(!LIVE)("production smoke (live API)", () => {
  it("lists contracts with the default minimal shape", async () => {
    const client = productionClient();
    const res = await client.listContracts({ limit: 5 });
    const first = expectNonEmpty(res);
    expectFields(first, ["key", "piid"]);
  });

  it("lists contracts with a custom shape", async () => {
    const client = productionClient();
    const res = await client.listContracts({ limit: 3, shape: "key,piid,recipient(display_name),total_contract_value,award_date" });
    const first = expectNonEmpty(res);
    expectFields(first, ["key", "piid"]);
  });

  it("lists entities", async () => {
    const client = productionClient();
    const res = await client.listEntities({ limit: 5 });
    const first = expectNonEmpty(res);
    expectFields(first, ["uei", "legal_business_name"]);
  });

  it("lists agencies", async () => {
    const client = productionClient();
    const res = await client.listAgencies({ limit: 5 });
    expectNonEmpty(res);
  });

  it("parses rate-limit headers from a real response", async () => {
    const client = productionClient();
    const res = await client.listNaics({ limit: 1 });
    expectPagination(res);
    const info = client.rateLimitInfo;
    expect(info).not.toBeNull();
    expect(typeof info?.limit === "number" || typeof info?.remaining === "number").toBe(true);
    expect(client.lastResponseHeaders).not.toBeNull();
  });
});
