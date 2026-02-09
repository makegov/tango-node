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

  it("supports vehicles list + detail + awardees endpoints", async () => {
    const calls: { url: string; init: RequestInit }[] = [];

    const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<any> => {
      calls.push({ url: String(url), init: init ?? {} });

      const parsed = new URL(String(url));

      if (parsed.pathname.endsWith("/awardees/")) {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              count: 1,
              results: [
                {
                  uuid: "00000000-0000-0000-0000-000000000002",
                  key: "IDV-KEY",
                  award_date: "2024-01-01",
                  idv_obligations: 100.0,
                  recipient: { display_name: "Acme", uei: "UEI123" },
                },
              ],
            });
          },
        };
      }

      if (parsed.pathname === "/api/vehicles/") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              count: 1,
              results: [
                {
                  uuid: "00000000-0000-0000-0000-000000000001",
                  solicitation_identifier: "47QSWA20D0001",
                  solicitation_date: "2024-01-15",
                  vehicle_obligations: 123.45,
                },
              ],
            });
          },
        };
      }

      // getVehicle (detail) response with custom joiner and flat response
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            uuid: "00000000-0000-0000-0000-000000000001",
            opportunity__title: "Test Opportunity",
          });
        },
      };
    };

    const client = new TangoClient({
      apiKey: "test",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const vehicles = await client.listVehicles({ search: "GSA" });
    expect(vehicles.results[0]).toMatchObject({
      uuid: "00000000-0000-0000-0000-000000000001",
      solicitation_identifier: "47QSWA20D0001",
    });
    expect((vehicles.results[0] as any).solicitation_date).toBeInstanceOf(Date);
    expect((vehicles.results[0] as any).vehicle_obligations).toBe("123.45");

    const vehicle = await client.getVehicle("00000000-0000-0000-0000-000000000001", {
      shape: "uuid,opportunity(title)",
      flat: true,
      joiner: "__",
      flatLists: true,
    });
    expect((vehicle as any).opportunity.title).toBe("Test Opportunity");

    const awardees = await client.listVehicleAwardees("00000000-0000-0000-0000-000000000001");
    expect((awardees.results[0] as any).award_date).toBeInstanceOf(Date);
    expect((awardees.results[0] as any).idv_obligations).toBe("100");

    // Verify query params were sent for each call
    expect(calls).toHaveLength(3);
    const urls = calls.map((c) => new URL(c.url));

    // listVehicles
    expect(urls[0].pathname).toBe("/api/vehicles/");
    expect(urls[0].searchParams.get("shape")).toBe(ShapeConfig.VEHICLES_MINIMAL);
    expect(urls[0].searchParams.get("search")).toBe("GSA");

    // getVehicle
    expect(urls[1].pathname).toBe("/api/vehicles/00000000-0000-0000-0000-000000000001/");
    expect(urls[1].searchParams.get("shape")).toBe("uuid,opportunity(title)");
    expect(urls[1].searchParams.get("flat")).toBe("true");
    expect(urls[1].searchParams.get("joiner")).toBe("__");
    expect(urls[1].searchParams.get("flat_lists")).toBe("true");

    // listVehicleAwardees
    expect(urls[2].pathname).toBe("/api/vehicles/00000000-0000-0000-0000-000000000001/awardees/");
    expect(urls[2].searchParams.get("shape")).toBe(ShapeConfig.VEHICLE_AWARDEES_MINIMAL);
  });

  it("validates required arguments for getVehicle", async () => {
    const client = new TangoClient({
      apiKey: "test",
      baseUrl: "https://example.test",
      fetchImpl: async () => {
        throw new Error("should not be called");
      },
    });

    // @ts-expect-error
    await expect(client.getVehicle("")).rejects.toBeInstanceOf(TangoValidationError);
  });

  it("supports idv endpoints (list + retrieve + child endpoints)", async () => {
    const calls: string[] = [];

    const fetchImpl = async (url: string | URL): Promise<any> => {
      calls.push(String(url));
      const parsed = new URL(String(url));

      if (parsed.pathname === "/api/idvs/") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              count: 1,
              next: "https://example.test/api/idvs/?cursor=next",
              results: [
                {
                  key: "IDV-KEY",
                  piid: "47QSWA20D0001",
                  award_date: "2024-01-01",
                  obligated: 10.0,
                  idv_type: { code: "A", description: "GWAC" },
                  recipient: { display_name: "Acme", uei: "UEI123" },
                },
              ],
            });
          },
        };
      }

      if (parsed.pathname === "/api/idvs/IDV-KEY/") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              key: "IDV-KEY",
              award_date: "2024-01-01",
              obligated: 10.0,
            });
          },
        };
      }

      if (parsed.pathname === "/api/idvs/IDV-KEY/awards/") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              count: 1,
              results: [{ key: "C-1", award_date: "2024-01-02", total_contract_value: 123.45 }],
            });
          },
        };
      }

      if (parsed.pathname === "/api/idvs/IDV-KEY/idvs/") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              count: 0,
              results: [],
            });
          },
        };
      }

      if (parsed.pathname === "/api/idvs/IDV-KEY/transactions/") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              count: 1,
              results: [{ modification_number: "0", obligated: 1.23, transaction_date: "2024-01-03" }],
            });
          },
        };
      }

      if (parsed.pathname === "/api/idvs/SOL/summary/") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({ solicitation_identifier: "SOL", awardee_count: 2 });
          },
        };
      }

      // /summary/awards/
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ count: 0, results: [] });
        },
      };
    };

    const client = new TangoClient({
      apiKey: "test",
      baseUrl: "https://example.test",
      fetchImpl,
    });

    const idvs = await client.listIdvs({ limit: 10, cursor: "abc", awarding_agency: "4700" });
    expect(idvs.results).toHaveLength(1);
    expect((idvs.results[0] as any).award_date).toBeInstanceOf(Date);
    expect((idvs.results[0] as any).obligated).toBe("10");

    const idv = await client.getIdv("IDV-KEY");
    expect((idv as any).key).toBe("IDV-KEY");

    const awards = await client.listIdvAwards("IDV-KEY", { limit: 5 });
    expect((awards.results[0] as any).award_date).toBeInstanceOf(Date);
    expect((awards.results[0] as any).total_contract_value).toBe("123.45");

    await client.listIdvChildIdvs({ key: "IDV-KEY", limit: 5 });
    await client.listIdvTransactions("IDV-KEY", { limit: 50 });
    await client.getIdvSummary("SOL");
    await client.listIdvSummaryAwards("SOL", { limit: 25, ordering: "-award_date" });

    const parsedCalls = calls.map((u) => new URL(u));

    // listIdvs
    expect(parsedCalls[0].pathname).toBe("/api/idvs/");
    expect(parsedCalls[0].searchParams.get("limit")).toBe("10");
    expect(parsedCalls[0].searchParams.get("cursor")).toBe("abc");
    expect(parsedCalls[0].searchParams.get("awarding_agency")).toBe("4700");
    expect(parsedCalls[0].searchParams.get("shape")).toBe(ShapeConfig.IDVS_MINIMAL);
  });

  it("supports webhooks v2 endpoints (event types, subscriptions, test delivery, sample payload)", async () => {
    const calls: { url: string; init: RequestInit }[] = [];

    const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<any> => {
      calls.push({ url: String(url), init: init ?? {} });
      const parsed = new URL(String(url));
      const method = String(init?.method ?? "GET").toUpperCase();

      if (parsed.pathname === "/api/webhooks/event-types/" && method === "GET") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              event_types: [{ event_type: "awards.new_award", default_subject_type: "entity", description: "", schema_version: 1 }],
              subject_types: ["entity"],
              subject_type_definitions: [{ subject_type: "entity", description: "Entity UEI", id_format: "UEI", status: "active" }],
            });
          },
        };
      }

      if (parsed.pathname === "/api/webhooks/subscriptions/" && method === "GET") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              count: 1,
              next: null,
              previous: null,
              results: [{ id: "sub-1", subscription_name: "My sub", payload: { records: [] }, created_at: "2026-01-01T00:00:00Z" }],
            });
          },
        };
      }

      if (parsed.pathname === "/api/webhooks/subscriptions/" && method === "POST") {
        return {
          ok: true,
          status: 201,
          async text() {
            return JSON.stringify({ id: "sub-1", subscription_name: "My sub", payload: { records: [] }, created_at: "2026-01-01T00:00:00Z" });
          },
        };
      }

      if (parsed.pathname === "/api/webhooks/subscriptions/sub-1/" && method === "PATCH") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({ id: "sub-1", subscription_name: "Updated", payload: { records: [] }, created_at: "2026-01-01T00:00:00Z" });
          },
        };
      }

      if (parsed.pathname === "/api/webhooks/subscriptions/sub-1/" && method === "DELETE") {
        return {
          ok: true,
          status: 204,
          async text() {
            return "";
          },
        };
      }

      if (parsed.pathname === "/api/webhooks/endpoints/test-delivery/" && method === "POST") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({ success: true, status_code: 200, message: "ok" });
          },
        };
      }

      if (parsed.pathname === "/api/webhooks/endpoints/sample-payload/" && method === "GET") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              event_type: "awards.new_award",
              sample_delivery: { timestamp: "2026-01-01T00:00:00Z", events: [{ event_type: "awards.new_award" }] },
              sample_subjects: [{ subject_type: "entity", subject_id: "UEI123" }],
              sample_subscription_requests: {},
              signature_header: "X-Tango-Signature: sha256=<hmac>",
              note: "sample",
            });
          },
        };
      }

      if (parsed.pathname === "/api/webhooks/endpoints/" && method === "GET") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              count: 1,
              next: null,
              previous: null,
              results: [
                {
                  id: "ep-1",
                  name: "yoni",
                  callback_url: "https://example.com/tango/webhooks",
                  is_active: true,
                  created_at: "2026-01-01T00:00:00Z",
                  updated_at: "2026-01-01T00:00:00Z",
                },
              ],
            });
          },
        };
      }

      if (parsed.pathname === "/api/webhooks/endpoints/" && method === "POST") {
        return {
          ok: true,
          status: 201,
          async text() {
            return JSON.stringify({
              id: "ep-1",
              name: "yoni",
              callback_url: "https://example.com/tango/webhooks",
              secret: "secret",
              is_active: true,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            });
          },
        };
      }

      if (parsed.pathname === "/api/webhooks/endpoints/ep-1/" && method === "PATCH") {
        return {
          ok: true,
          status: 200,
          async text() {
            return JSON.stringify({
              id: "ep-1",
              name: "yoni",
              callback_url: "https://example.com/tango/webhooks",
              is_active: false,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-02T00:00:00Z",
            });
          },
        };
      }

      if (parsed.pathname === "/api/webhooks/endpoints/ep-1/" && method === "DELETE") {
        return {
          ok: true,
          status: 204,
          async text() {
            return "";
          },
        };
      }

      throw new Error(`Unexpected request: ${method} ${parsed.pathname}`);
    };

    const client = new TangoClient({ apiKey: "test", baseUrl: "https://example.test", fetchImpl });

    const eventTypes = await client.listWebhookEventTypes();
    expect(eventTypes.event_types[0].event_type).toBe("awards.new_award");

    const subs = await client.listWebhookSubscriptions({ page: 2, pageSize: 25 });
    expect(subs.count).toBe(1);
    expect(subs.results[0].subscription_name).toBe("My sub");

    await client.createWebhookSubscription({ subscriptionName: "My sub", payload: { records: [] } });
    await client.updateWebhookSubscription("sub-1", { subscriptionName: "Updated" });
    await client.deleteWebhookSubscription("sub-1");

    const testResult = await client.testWebhookDelivery();
    expect(testResult.success).toBe(true);

    const sample = await client.getWebhookSamplePayload({ eventType: "awards.new_award" });
    expect((sample as any).event_type).toBe("awards.new_award");

    const endpoints = await client.listWebhookEndpoints({ page: 2, limit: 10 });
    expect(endpoints.count).toBe(1);
    expect(endpoints.results[0].name).toBe("yoni");

    const created = await client.createWebhookEndpoint({ callbackUrl: "https://example.com/tango/webhooks" });
    expect((created as any).secret).toBe("secret");

    const updated = await client.updateWebhookEndpoint(created.id, { isActive: false });
    expect(updated.is_active).toBe(false);

    await client.deleteWebhookEndpoint(created.id);

    const listSubsCall = calls.find(
      (c) => new URL(c.url).pathname === "/api/webhooks/subscriptions/" && String(c.init.method ?? "GET").toUpperCase() === "GET",
    );
    expect(listSubsCall).toBeTruthy();
    const listSubsQuery = new URL(listSubsCall!.url).searchParams;
    expect(listSubsQuery.get("page")).toBe("2");
    expect(listSubsQuery.get("page_size")).toBe("25");

    const sampleCall = calls.find((c) => new URL(c.url).pathname === "/api/webhooks/endpoints/sample-payload/");
    expect(sampleCall).toBeTruthy();
    const sampleQuery = new URL(sampleCall!.url).searchParams;
    expect(sampleQuery.get("event_type")).toBe("awards.new_award");

    const createCall = calls.find(
      (c) => new URL(c.url).pathname === "/api/webhooks/subscriptions/" && String(c.init.method).toUpperCase() === "POST",
    );
    expect(createCall).toBeTruthy();
    const createBody = JSON.parse(String(createCall!.init.body ?? "{}"));
    expect(createBody.subscription_name).toBe("My sub");
    expect(createBody.payload).toEqual({ records: [] });

    const listEndpointsCall = calls.find(
      (c) => new URL(c.url).pathname === "/api/webhooks/endpoints/" && String(c.init.method ?? "GET").toUpperCase() === "GET",
    );
    expect(listEndpointsCall).toBeTruthy();
    const listEndpointsQuery = new URL(listEndpointsCall!.url).searchParams;
    expect(listEndpointsQuery.get("page")).toBe("2");
    expect(listEndpointsQuery.get("limit")).toBe("10");

    const createEndpointCall = calls.find(
      (c) => new URL(c.url).pathname === "/api/webhooks/endpoints/" && String(c.init.method).toUpperCase() === "POST",
    );
    expect(createEndpointCall).toBeTruthy();
    const createEndpointBody = JSON.parse(String(createEndpointCall!.init.body ?? "{}"));
    expect(createEndpointBody.callback_url).toBe("https://example.com/tango/webhooks");
    expect(createEndpointBody.is_active).toBe(true);

    const updateEndpointCall = calls.find(
      (c) => new URL(c.url).pathname === "/api/webhooks/endpoints/ep-1/" && String(c.init.method).toUpperCase() === "PATCH",
    );
    expect(updateEndpointCall).toBeTruthy();
    const updateEndpointBody = JSON.parse(String(updateEndpointCall!.init.body ?? "{}"));
    expect(updateEndpointBody.is_active).toBe(false);

    const deleteEndpointCall = calls.find(
      (c) => new URL(c.url).pathname === "/api/webhooks/endpoints/ep-1/" && String(c.init.method).toUpperCase() === "DELETE",
    );
    expect(deleteEndpointCall).toBeTruthy();
  });
});
