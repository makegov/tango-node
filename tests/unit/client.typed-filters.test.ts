/**
 * Filters the API added between 5.3.0 and 5.8.0, declared as typed options and sent under the API's own param names.
 */

import { TangoClient } from "../../src/client.js";

function makeClient(): { client: TangoClient; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    urls.push(String(url));
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({ count: 0, next: null, previous: null, results: [] });
      },
    };
  }) as unknown as typeof fetch;
  const client = new TangoClient({ apiKey: "k", baseUrl: "http://localhost:8000", fetchImpl, retries: 0 });
  return { client, urls };
}

function sent(urls: string[]): { path: string; params: URLSearchParams } {
  const url = new URL(urls[0]);
  return { path: url.pathname, params: url.searchParams };
}

describe("typed filters added through Tango API 5.8.0", () => {
  it("listOpportunities sends awarded and awardee_uei", async () => {
    const { client, urls } = makeClient();
    await client.listOpportunities({ awarded: true, awardee_uei: "ABCDEFGHJKL1|ZYXWVUTSRQP9" });
    const { path, params } = sent(urls);
    expect(path).toBe("/api/opportunities/");
    expect(params.get("awarded")).toBe("true");
    expect(params.get("awardee_uei")).toBe("ABCDEFGHJKL1|ZYXWVUTSRQP9");
  });

  it("listOpportunities sends awarded=false rather than dropping it", async () => {
    const { client, urls } = makeClient();
    await client.listOpportunities({ awarded: false });
    expect(sent(urls).params.get("awarded")).toBe("false");
  });

  it("listExclusions sends agency", async () => {
    const { client, urls } = makeClient();
    await client.listExclusions({ agency: "EPA|GSA" });
    const { path, params } = sent(urls);
    expect(path).toBe("/api/exclusions/");
    expect(params.get("agency")).toBe("EPA|GSA");
  });

  it("listItDashboard sends agency", async () => {
    const { client, urls } = makeClient();
    await client.listItDashboard({ agency: "Department of Energy" });
    const { path, params } = sent(urls);
    expect(path).toBe("/api/itdashboard/");
    expect(params.get("agency")).toBe("Department of Energy");
  });

  it("listSbirTopics sends cycle_name", async () => {
    const { client, urls } = makeClient();
    await client.listSbirTopics({ cycle_name: "DOD_SBIR_2026_P1_CBZ" });
    const { path, params } = sent(urls);
    expect(path).toBe("/api/sbir/topics/");
    expect(params.get("cycle_name")).toBe("DOD_SBIR_2026_P1_CBZ");
  });

  it("listBudgetAccounts sends agency, account category and data_through_period filters with their dunder names", async () => {
    const { client, urls } = makeClient();
    await client.listBudgetAccounts({
      agency: "EPA",
      account_category: "budgetary",
      account_category__in: "budgetary,credit_financing",
      data_through_period: 12,
      data_through_period__gte: 6,
      data_through_period__lte: 11,
      data_through_period__isnull: false,
    });
    const { path, params } = sent(urls);
    expect(path).toBe("/api/budget/accounts/");
    expect(Object.fromEntries([...params.entries()].filter(([k]) => !["page", "limit"].includes(k)))).toEqual({
      agency: "EPA",
      account_category: "budgetary",
      account_category__in: "budgetary,credit_financing",
      data_through_period: "12",
      data_through_period__gte: "6",
      data_through_period__lte: "11",
      data_through_period__isnull: "false",
    });
  });
});
