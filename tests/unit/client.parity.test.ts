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
