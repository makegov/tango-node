/**
 * `meta` from the API's agency-filter diagnostics (port of Python's TestAgencyFilterDiagnostics, tango-python #55).
 *
 * Agency resolution is fuzzy, so a token can be dropped entirely or matched to an organization the caller did not intend.
 * Before the API exposed `meta`, both were indistinguishable from "no such records exist" — and the SDK is the last place that distinction can reach a user.
 */

import { TangoClient } from "../../src/client.js";
import { TangoValidationError } from "../../src/errors.js";
import type { PaginatedResponse } from "../../src/types.js";

const HUD = {
  key: "3f2a0000-0000-0000-0000-000000000001",
  name: "Department of Housing and Urban Development",
  level: 1,
  cgac: "086",
  fpds_code: null,
};

function makeClient(body: unknown, status = 200): TangoClient {
  const fetchImpl = (async () => ({
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  })) as unknown as typeof fetch;
  return new TangoClient({ apiKey: "k", baseUrl: "http://localhost:8000", fetchImpl, retries: 0 });
}

function emptyPage(meta?: unknown): Record<string, unknown> {
  const payload: Record<string, unknown> = { count: 0, next: null, previous: null, results: [] };
  if (meta !== undefined) payload.meta = meta;
  return payload;
}

describe("PaginatedResponse agency-filter diagnostics", () => {
  it("meta is carried through to the response", async () => {
    const meta = {
      resolved_filters: {
        awarding_agency: [
          { token: "HUD", resolved: HUD },
          { token: "HUDD", resolved: null },
        ],
      },
      warnings: ["Agency filter 'awarding_agency': 'HUDD' did not match."],
    };
    const res = await makeClient(emptyPage(meta)).listContracts({ awarding_agency: "HUD|HUDD" });
    expect(res.meta).toEqual(meta);
  });

  it("dropped tokens are reported per filter", async () => {
    const res = await makeClient(
      emptyPage({
        resolved_filters: {
          awarding_agency: [
            { token: "HUD", resolved: HUD },
            { token: "HUDD", resolved: null },
          ],
          funding_agency: [{ token: "NOPE", resolved: null }],
        },
      }),
    ).listContracts({ awarding_agency: "HUD|HUDD" });
    expect(res.unresolvedAgencyTokens).toEqual({
      awarding_agency: ["HUDD"],
      funding_agency: ["NOPE"],
    });
  });

  it("resolvedAgencies exposes the matched organization", async () => {
    // The wrong-subtree case: nothing was dropped, so only the resolved name
    // reveals that a token matched an organization the caller did not intend.
    const res = await makeClient(
      emptyPage({ resolved_filters: { awarding_agency: [{ token: "HUD", resolved: HUD }] } }),
    ).listContracts({ awarding_agency: "HUD" });
    expect(res.unresolvedAgencyTokens).toEqual({});
    expect(res.resolvedAgencies.awarding_agency.map((org) => org.name)).toEqual([
      "Department of Housing and Urban Development",
    ]);
  });

  it("warnings are surfaced", async () => {
    const res = await makeClient(
      emptyPage({ warnings: ["Agency filter 'agency': 'X' did not match."] }),
    ).listOpportunities();
    expect(res.agencyWarnings).toEqual(["Agency filter 'agency': 'X' did not match."]);
  });

  it("absent meta yields empty accessors, not errors", async () => {
    const res = await makeClient(emptyPage()).listContracts();
    expect(res.meta).toBeNull();
    expect(res.agencyWarnings).toEqual([]);
    expect(res.unresolvedAgencyTokens).toEqual({});
    expect(res.resolvedAgencies).toEqual({});
  });

  it("malformed meta does not raise", async () => {
    // `meta` is server-controlled; a shape change must not crash a caller's loop.
    const res = await makeClient(
      emptyPage({ resolved_filters: "not-a-dict", warnings: "not-a-list" }),
    ).listContracts();
    expect(res.agencyWarnings).toEqual([]);
    expect(res.unresolvedAgencyTokens).toEqual({});
    expect(res.resolvedAgencies).toEqual({});
  });

  it("a full miss raises with the offending token", async () => {
    // A fully-unresolvable agency filter is a 400, not an empty page.
    const client = makeClient({ error: "No agency found matching 'HUDD'." }, 400);
    await expect(client.listContracts({ awarding_agency: "HUDD" })).rejects.toThrow(TangoValidationError);
    await expect(client.listContracts({ awarding_agency: "HUDD" })).rejects.toThrow(/HUDD/);
  });
});

describe("PaginatedResponse type compatibility", () => {
  it("a bare literal without the meta diagnostic fields still typechecks", () => {
    const bare: PaginatedResponse<Record<string, unknown>> = {
      count: 0,
      next: null,
      previous: null,
      pageMetadata: null,
      cursor: null,
      results: [],
    };
    expect(bare.meta).toBeUndefined();
    expect(bare.agencyWarnings).toBeUndefined();
    expect(bare.unresolvedAgencyTokens).toBeUndefined();
    expect(bare.resolvedAgencies).toBeUndefined();
  });
});
