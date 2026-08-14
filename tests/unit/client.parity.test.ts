/**
 * Tests for Python-parity methods added in the api-parity branch.
 *
 * Each test exercises a single new method, capturing the URL + query
 * params + body and confirming the parsed response shape comes back.
 */

import { TangoClient } from "../../src/client.js";

type RecordedCall = { url: string; init?: RequestInit | undefined };

interface MockResponseBody {
  count?: number;
  next?: string | null;
  previous?: string | null;
  results?: unknown[];
  [key: string]: unknown;
}

function recordingFetch(body: MockResponseBody | unknown = { count: 0, next: null, previous: null, results: [] }): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(body);
      },
    };
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function makeClient(body?: MockResponseBody | unknown): { client: TangoClient; calls: RecordedCall[] } {
  const { fetchImpl, calls } = recordingFetch(body);
  const client = new TangoClient({
    apiKey: "k",
    baseUrl: "http://localhost:8000",
    fetchImpl,
    retries: 0,
  });
  return { client, calls };
}

describe("TangoClient — sub-detail methods", () => {
  it("getDepartment", async () => {
    const { client, calls } = makeClient({ code: "DOD", name: "Defense" });
    const res = await client.getDepartment("DOD");
    expect(calls[0].url).toContain("/api/departments/DOD/");
    expect(res.code).toBe("DOD");
  });

  it("getDepartment throws when code is empty", async () => {
    const { client } = makeClient();
    await expect(client.getDepartment("")).rejects.toThrow();
  });

  it("getBusinessType", async () => {
    const { client, calls } = makeClient({ code: "27" });
    await client.getBusinessType("27");
    expect(calls[0].url).toContain("/api/business_types/27/");
  });
});

describe("TangoClient — entity sub-resources", () => {
  it("listEntityContracts hits /api/entities/{uei}/contracts/", async () => {
    const { client, calls } = makeClient();
    await client.listEntityContracts("ABC123", { limit: 10, search: "drone" });
    expect(calls[0].url).toContain("/api/entities/ABC123/contracts/");
    expect(calls[0].url).toContain("limit=10");
    expect(calls[0].url).toContain("search=drone");
  });

  it("listEntityIdvs", async () => {
    const { client, calls } = makeClient();
    await client.listEntityIdvs("ABC123");
    expect(calls[0].url).toContain("/api/entities/ABC123/idvs/");
  });

  it("listEntityOtas", async () => {
    const { client, calls } = makeClient();
    await client.listEntityOtas("ABC123");
    expect(calls[0].url).toContain("/api/entities/ABC123/otas/");
  });

  it("listEntityOtidvs", async () => {
    const { client, calls } = makeClient();
    await client.listEntityOtidvs("ABC123");
    expect(calls[0].url).toContain("/api/entities/ABC123/otidvs/");
  });

  it("listEntitySubawards uses page-based pagination", async () => {
    const { client, calls } = makeClient();
    await client.listEntitySubawards("ABC123", { page: 2, limit: 50 });
    expect(calls[0].url).toContain("/api/entities/ABC123/subawards/");
    expect(calls[0].url).toContain("page=2");
    expect(calls[0].url).toContain("limit=50");
  });

  it("listEntityLcats", async () => {
    const { client, calls } = makeClient();
    await client.listEntityLcats("ABC123", { search: "engineer" });
    expect(calls[0].url).toContain("/api/entities/ABC123/lcats/");
    expect(calls[0].url).toContain("search=engineer");
  });

  it("getEntityMetrics", async () => {
    const { client, calls } = makeClient({ metrics: {} });
    await client.getEntityMetrics("ABC123", 12, "monthly");
    expect(calls[0].url).toContain("/api/entities/ABC123/metrics/12/monthly/");
  });

  it("getEntityMetrics requires uei", async () => {
    const { client } = makeClient();
    await expect(client.getEntityMetrics("", 12, "monthly")).rejects.toThrow();
  });

  it("listEntityContracts requires UEI", async () => {
    const { client } = makeClient();
    await expect(client.listEntityContracts("")).rejects.toThrow();
  });
});

describe("TangoClient — IDV sub-resources", () => {
  it("listIdvLcats", async () => {
    const { client, calls } = makeClient();
    await client.listIdvLcats("GS-00F-XXXX", { page: 1 });
    expect(calls[0].url).toContain("/api/idvs/GS-00F-XXXX/lcats/");
  });

  it("listIdvLcats requires key", async () => {
    const { client } = makeClient();
    await expect(client.listIdvLcats("")).rejects.toThrow();
  });
});

describe("TangoClient — agency sub-resources", () => {
  it("listAgencyAwardingContracts", async () => {
    const { client, calls } = makeClient();
    await client.listAgencyAwardingContracts("9700", { limit: 5 });
    expect(calls[0].url).toContain("/api/agencies/9700/contracts/awarding/");
    expect(calls[0].url).toContain("limit=5");
  });

  it("listAgencyFundingContracts", async () => {
    const { client, calls } = makeClient();
    await client.listAgencyFundingContracts("9700");
    expect(calls[0].url).toContain("/api/agencies/9700/contracts/funding/");
  });

  it("listAgencyAwardingContracts requires code", async () => {
    const { client } = makeClient();
    await expect(client.listAgencyAwardingContracts("")).rejects.toThrow();
  });
});

describe("TangoClient — typed metrics wrappers", () => {
  it("getNaicsMetrics", async () => {
    const { client, calls } = makeClient({});
    await client.getNaicsMetrics("541511", 12, "monthly");
    expect(calls[0].url).toContain("/api/naics/541511/metrics/12/monthly/");
  });

  it("getPscMetrics", async () => {
    const { client, calls } = makeClient({});
    await client.getPscMetrics("D302", 6, "quarterly");
    expect(calls[0].url).toContain("/api/psc/D302/metrics/6/quarterly/");
  });

  it("getNaicsMetrics requires code", async () => {
    const { client } = makeClient();
    await expect(client.getNaicsMetrics("", 12, "monthly")).rejects.toThrow();
  });
});

describe("TangoClient — webhook alerts CRUD parity", () => {
  it("listWebhookAlerts", async () => {
    const { client, calls } = makeClient({
      count: 1,
      next: null,
      previous: null,
      results: [{ alert_id: "a-1", name: "n", query_type: "contract" }],
    });
    const res = await client.listWebhookAlerts({ page: 2, pageSize: 10 });
    expect(calls[0].url).toContain("/api/webhooks/alerts/");
    expect(calls[0].url).toContain("page=2");
    expect(calls[0].url).toContain("page_size=10");
    expect(res.count).toBe(1);
    expect(res.results).toHaveLength(1);
  });

  it("getWebhookAlert", async () => {
    const { client, calls } = makeClient({ alert_id: "a-1", name: "n" });
    const res = await client.getWebhookAlert("a-1");
    expect(calls[0].url).toContain("/api/webhooks/alerts/a-1/");
    expect((res as Record<string, unknown>).alert_id).toBe("a-1");
  });

  it("getWebhookAlert requires id", async () => {
    const { client } = makeClient();
    await expect(client.getWebhookAlert("")).rejects.toThrow();
  });

  it("updateWebhookAlert maps camelCase fields to snake_case", async () => {
    const { client, calls } = makeClient({ alert_id: "a-1", name: "renamed" });
    await client.updateWebhookAlert("a-1", {
      name: "renamed",
      frequency: "daily",
      cronExpression: "0 9 * * *",
      isActive: false,
    });
    expect(calls[0].url).toContain("/api/webhooks/alerts/a-1/");
    expect(calls[0].init?.method).toBe("PATCH");
    const body = JSON.parse(String(calls[0].init?.body ?? "{}"));
    expect(body.name).toBe("renamed");
    expect(body.frequency).toBe("daily");
    expect(body.cron_expression).toBe("0 9 * * *");
    expect(body.is_active).toBe(false);
  });

  it("updateWebhookAlert requires id", async () => {
    const { client } = makeClient();
    await expect(client.updateWebhookAlert("", { name: "x" })).rejects.toThrow();
  });

  it("createWebhookAlert passes through endpoint when provided (multi-endpoint accounts)", async () => {
    const { client, calls } = makeClient({ alert_id: "a-1", name: "n", query_type: "contract" });
    await client.createWebhookAlert({
      name: "n",
      query_type: "contract",
      filters: { search: "drone" },
      endpoint: "ep-uuid-123",
    });
    expect(calls[0].url).toContain("/api/webhooks/alerts/");
    const body = JSON.parse(String(calls[0].init?.body ?? "{}"));
    expect(body.endpoint).toBe("ep-uuid-123");
    expect(body.name).toBe("n");
    expect(body.query_type).toBe("contract");
  });

  it("createWebhookAlert omits endpoint when not provided (single-endpoint auto-resolve)", async () => {
    const { client, calls } = makeClient({ alert_id: "a-1", name: "n", query_type: "contract" });
    await client.createWebhookAlert({
      name: "n",
      query_type: "contract",
      filters: { search: "drone" },
    });
    const body = JSON.parse(String(calls[0].init?.body ?? "{}"));
    expect(body).not.toHaveProperty("endpoint");
  });
});

describe("TangoClient — webhook test-delivery body shape", () => {
  it("testWebhookEndpoint sends canonical { endpoint } body key (tango#2252)", async () => {
    const { client, calls } = makeClient({ success: true, status_code: 200 });
    await client.testWebhookEndpoint("ep-uuid-123");
    expect(calls[0].url).toContain("/api/webhooks/endpoints/test-delivery/");
    const body = JSON.parse(String(calls[0].init?.body ?? "{}"));
    expect(body.endpoint).toBe("ep-uuid-123");
    expect(body).not.toHaveProperty("endpoint_id");
  });

  it("testWebhookDelivery sends canonical { endpoint } when endpointId provided", async () => {
    const { client, calls } = makeClient({ success: true, status_code: 200 });
    await client.testWebhookDelivery({ endpointId: "ep-uuid-123" });
    const body = JSON.parse(String(calls[0].init?.body ?? "{}"));
    expect(body.endpoint).toBe("ep-uuid-123");
    expect(body).not.toHaveProperty("endpoint_id");
  });

  it("testWebhookDelivery sends empty body when endpointId omitted (auto-resolve)", async () => {
    const { client, calls } = makeClient({ success: true, status_code: 200 });
    await client.testWebhookDelivery();
    const body = JSON.parse(String(calls[0].init?.body ?? "{}"));
    expect(body).not.toHaveProperty("endpoint");
    expect(body).not.toHaveProperty("endpoint_id");
  });
});

describe("TangoClient — GSA eLibrary detail", () => {
  it("getGsaElibraryContract hits the detail path with the default minimal shape", async () => {
    const { client, calls } = makeClient({ uuid: "abc-123", contract_number: "GS-35F-0001", schedule: "MAS" });
    const res = await client.getGsaElibraryContract("abc-123");
    expect(calls[0].url).toContain("/api/gsa_elibrary_contracts/abc-123/");
    expect(calls[0].url).toContain("shape=");
    expect((res as Record<string, unknown>).contract_number).toBe("GS-35F-0001");
  });

  it("getGsaElibraryContract passes an explicit shape + flat params", async () => {
    const { client, calls } = makeClient({ uuid: "abc-123" });
    await client.getGsaElibraryContract("abc-123", { shape: "uuid,contract_number", flat: true });
    expect(calls[0].url).toContain("shape=uuid%2Ccontract_number");
    expect(calls[0].url).toContain("flat=true");
    expect(calls[0].url).toContain("joiner=.");
  });

  it("getGsaElibraryContract requires uuid", async () => {
    const { client } = makeClient();
    await expect(client.getGsaElibraryContract("")).rejects.toThrow();
  });
});

describe("TangoClient — filter-surface catch-up", () => {
  it("listBudgetAccounts sends range triplets under their dunder wire names", async () => {
    const { client, calls } = makeClient();
    await client.listBudgetAccounts({
      requested_ba: 1000000,
      unobligated_balance__gte: 500000,
      obligated_to_apportioned_pct_capped__lte: 0.85,
    });
    expect(calls[0].url).toContain("/api/budget/accounts/");
    expect(calls[0].url).toContain("requested_ba=1000000");
    expect(calls[0].url).toContain("unobligated_balance__gte=500000");
    expect(calls[0].url).toContain("obligated_to_apportioned_pct_capped__lte=0.85");
  });

  it("listBudgetAccounts remaps the legacy aliases to the forms the API understands", async () => {
    const { client, calls } = makeClient();
    await client.listBudgetAccounts({ fiscal_year_gte: 2021, fiscal_year_lte: 2024, account_title: "procurement" });
    expect(calls[0].url).toContain("fiscal_year__gte=2021");
    expect(calls[0].url).toContain("fiscal_year__lte=2024");
    expect(calls[0].url).toContain("account_title__icontains=procurement");
    expect(calls[0].url).not.toContain("fiscal_year_gte=2021");
    expect(calls[0].url).not.toContain("account_title=procurement");
  });

  it("listBudgetAccounts lets an explicit dunder param win over its legacy alias", async () => {
    const { client, calls } = makeClient();
    await client.listBudgetAccounts({ fiscal_year_gte: 2021, fiscal_year__gte: 2023 });
    expect(calls[0].url).toContain("fiscal_year__gte=2023");
    expect(calls[0].url).not.toContain("2021");
  });

  it("listNaics sends the employee_limit filters", async () => {
    const { client, calls } = makeClient();
    await client.listNaics({ employee_limit: 500, employee_limit_gte: 100 });
    expect(calls[0].url).toContain("/api/naics/");
    expect(calls[0].url).toContain("employee_limit=500");
    expect(calls[0].url).toContain("employee_limit_gte=100");
  });

  it("listPsc sends has_awards", async () => {
    const { client, calls } = makeClient();
    await client.listPsc({ has_awards: true });
    expect(calls[0].url).toContain("/api/psc/");
    expect(calls[0].url).toContain("has_awards=true");
  });

  it("listProtests sends naics_code verbatim (not remapped to naics)", async () => {
    const { client, calls } = makeClient();
    await client.listProtests({ naics_code: "541511" });
    expect(calls[0].url).toContain("/api/protests/");
    expect(calls[0].url).toContain("naics_code=541511");
    expect(calls[0].url).not.toContain("naics=541511");
  });
});

describe("TangoClient — misc parity methods", () => {
  it("searchOpportunityAttachments", async () => {
    const { client, calls } = makeClient({ results: [] });
    await client.searchOpportunityAttachments({ q: "cybersecurity", topK: 5, includeExtractedText: true });
    expect(calls[0].url).toContain("/api/opportunities/attachment-search/");
    expect(calls[0].url).toContain("q=cybersecurity");
    expect(calls[0].url).toContain("top_k=5");
    expect(calls[0].url).toContain("include_extracted_text=true");
  });

  it("searchOpportunityAttachments requires q", async () => {
    const { client } = makeClient();
    await expect(client.searchOpportunityAttachments({ q: "" })).rejects.toThrow();
  });

  it("getVersion", async () => {
    const { client, calls } = makeClient({ version: "1.0.0" });
    const res = await client.getVersion();
    expect(calls[0].url).toContain("/api/version/");
    expect((res as Record<string, unknown>).version).toBe("1.0.0");
  });

  it("listApiKeys", async () => {
    const { client, calls } = makeClient({ keys: [] });
    await client.listApiKeys();
    expect(calls[0].url).toContain("/api/api-keys/");
  });
});
