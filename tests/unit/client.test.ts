import { TangoClient } from "../../src/client";
import { ShapeConfig } from "../../src/config.js";
import { TangoNotFoundError, TangoValidationError } from "../../src/errors.js";
import type { Contract } from "../../src/models/Contract.js";

describe("TangoClient", () => {
  it("maps high-level contract filters to API query params", async () => {
    const calls: { url: string; init: RequestInit }[] = [];

    const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<any> => {
      calls.push({ url: String(url), init: init ?? {} });

      const payload = {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            key: "C-1",
            piid: "PIID-1",
            award_date: "2024-01-15",
            "recipient.display_name": "Acme Corp",
          },
        ],
      };

      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(payload);
        },
      };
    };

    const client = new TangoClient({
      apiKey: "test",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const resp = await client.listContracts({
      keyword: "cloud",
      naics_code: "541511",
      psc_code: "D302",
      recipient_name: "Acme",
      recipient_uei: "UEI123",
      set_aside_type: "SB",
      sort: "award_date",
      order: "desc",
      flat: true,
      limit: 5,
      page: 2,
    });

    expect(resp.results).toHaveLength(1);
    const contract = resp.results[0] as any;
    // flat=true + unflattenResponse should give nested recipient
    expect(contract.recipient.display_name).toBe("Acme Corp");

    expect(calls).toHaveLength(1);
    const { url } = calls[0];
    const parsed = new URL(url);

    expect(parsed.searchParams.get("search")).toBe("cloud");
    expect(parsed.searchParams.get("naics")).toBe("541511");
    expect(parsed.searchParams.get("psc")).toBe("D302");
    expect(parsed.searchParams.get("recipient")).toBe("Acme");
    expect(parsed.searchParams.get("uei")).toBe("UEI123");
    expect(parsed.searchParams.get("set_aside")).toBe("SB");
    expect(parsed.searchParams.get("ordering")).toBe("-award_date");
    expect(parsed.searchParams.get("shape")).toBe(ShapeConfig.CONTRACTS_MINIMAL);
    expect(parsed.searchParams.get("flat")).toBe("true");
    expect(parsed.searchParams.get("limit")).toBe("5");
    expect(parsed.searchParams.get("page")).toBe("2");
  });

  it("uses default shapes for entities and supports search", async () => {
    const calls: { url: string; init: RequestInit }[] = [];

    const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<any> => {
      calls.push({ url: String(url), init: init ?? {} });

      const payload = {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            uei: "UEI123",
            legal_business_name: "Acme Corp",
          },
        ],
      };

      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(payload);
        },
      };
    };

    const client = new TangoClient({
      apiKey: "test",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const resp = await client.listEntities({
      search: "Acme",
      limit: 1,
    });

    expect(resp.results[0]).toMatchObject({
      uei: "UEI123",
      legal_business_name: "Acme Corp",
    });

    const parsed = new URL(calls[0].url);
    expect(parsed.searchParams.get("search")).toBe("Acme");
    expect(parsed.searchParams.get("shape")).toBe(ShapeConfig.ENTITIES_MINIMAL);
  });

  it("validates required arguments", async () => {
    const client = new TangoClient({
      apiKey: "test",
      baseUrl: "https://example.test",
      fetchImpl: async () => {
        throw new Error("should not be called");
      },
    });

    // @ts-expect-error
    await expect(client.getAgency("")).rejects.toBeInstanceOf(TangoValidationError);
    // @ts-expect-error
    await expect(client.getEntity("")).rejects.toBeInstanceOf(TangoValidationError);
  });

  it("propagates not found errors from getAgency", async () => {
    const client = new TangoClient({
      apiKey: "test",
      baseUrl: "https://example.test",
      fetchImpl: async (): Promise<any> => ({
        ok: false,
        status: 404,
        async text() {
          return JSON.stringify({ detail: "missing" });
        },
      }),
    });

    await expect(client.getAgency("XYZ")).rejects.toBeInstanceOf(TangoNotFoundError);
  });

  it("caps listContracts limit and merges filters", async () => {
    const calls: { url: string; init: RequestInit }[] = [];

    const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<any> => {
      calls.push({ url: String(url), init: init ?? {} });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ results: [] });
        },
      };
    };

    const client = new TangoClient({
      apiKey: "test",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    await client.listContracts({
      limit: 120,
      shape: null,
      sort: "award_date",
      order: "asc",
      filters: { foo: "bar" },
      extra: "value",
    });

    const search = new URL(calls[0].url).searchParams;
    expect(search.get("limit")).toBe("100"); // capped
    expect(search.get("ordering")).toBe("award_date");
    expect(search.get("foo")).toBe("bar");
    expect(search.get("extra")).toBe("value");
    expect(search.get("shape")).toBe(ShapeConfig.CONTRACTS_MINIMAL);
  });

  it("unflattens entity when flat=true and applies default shapes", async () => {
    const calls: { url: string; init: RequestInit }[] = [];

    const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<any> => {
      calls.push({ url: String(url), init: init ?? {} });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            uei: "UEI123",
            legal_business_name: "Acme Corp",
          });
        },
      };
    };

    const client = new TangoClient({
      apiKey: "test",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const entity = await client.getEntity("UEI123", { flat: true });
    expect((entity as any).legal_business_name).toBe("Acme Corp");

    const search = new URL(calls[0].url).searchParams;
    expect(search.get("shape")).toBe(ShapeConfig.ENTITIES_COMPREHENSIVE);
    expect(search.get("flat")).toBe("true");
  });

  it("sends shape flags for forecasts, opportunities, notices, and grants", async () => {
    const calls: string[] = [];
    const client = new TangoClient({
      apiKey: "test",
      baseUrl: "https://example.test",
      fetchImpl: async (url: string | URL): Promise<any> => ({
        ok: true,
        status: 200,
        async text() {
          calls.push(String(url));
          return JSON.stringify({ results: [] });
        },
      }),
    });

    await client.listForecasts({ flat: true, flatLists: true });
    await client.listOpportunities({ flat: true });
    await client.listNotices({ flat: true });
    await client.listGrants({ flatLists: true });

    expect(calls).toHaveLength(4);
    const params = calls.map((u) => new URL(u).searchParams);

    expect(params[0].get("shape")).toBe(ShapeConfig.FORECASTS_MINIMAL);
    expect(params[0].get("flat")).toBe("true");
    expect(params[0].get("flat_lists")).toBe("true");

    expect(params[1].get("shape")).toBe(ShapeConfig.OPPORTUNITIES_MINIMAL);
    expect(params[1].get("flat")).toBe("true");

    expect(params[2].get("shape")).toBe(ShapeConfig.NOTICES_MINIMAL);
    expect(params[2].get("flat")).toBe("true");

    expect(params[3].get("shape")).toBe(ShapeConfig.GRANTS_MINIMAL);
    expect(params[3].get("flat_lists")).toBe("true");
  });

  it("materializes shaped contract responses via ModelFactory", async () => {
    const client = new TangoClient({
      apiKey: "test",
      baseUrl: "https://example.test",
      fetchImpl: async (): Promise<any> => ({
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            count: 1,
            results: [
              {
                key: "C-1",
                piid: "PIID-1",
                award_date: "2024-01-02",
                total_contract_value: 123.45,
                recipient: { display_name: "Acme" },
              },
            ],
          });
        },
      }),
    });

    const resp = await client.listContracts({ limit: 1 });
    const contract = resp.results[0] as Contract;

    expect(contract.piid).toBe("PIID-1");
    expect(contract.award_date).toBeInstanceOf(Date);
    expect(contract.recipient?.display_name).toBe("Acme");
    expect((contract as any).total_contract_value).toBe("123.45");
  });
});
