import { DEFAULT_BASE_URL, ShapeConfig } from "./config.js";
import { TangoNotFoundError, TangoValidationError } from "./errors.js";
import { ModelFactory } from "./shapes/factory.js";
import { ShapeParser } from "./shapes/parser.js";
import type { ShapeSpec } from "./shapes/types.js";
import { HttpClient } from "./utils/http.js";
import { unflattenResponse } from "./utils/unflatten.js";
import { PaginatedResponse, TangoClientOptions } from "./types.js";
import type {
  WebhookEndpoint,
  WebhookEndpointCreateInput,
  WebhookEndpointUpdateInput,
  WebhookEventTypesResponse,
  WebhookSamplePayloadResponse,
  WebhookSubscription,
  WebhookSubscriptionCreateInput,
  WebhookSubscriptionPayload,
  WebhookSubscriptionUpdateInput,
  WebhookTestDeliveryResult,
} from "./models/Webhooks.js";

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Normalize a webhook-subscription create/update input into the wire body.
 *
 * Accepts BOTH the canonical snake_case shape (`subscription_name`,
 * `subject_type`, `subject_ids`, `event_type`, `query_type`,
 * `filter_definition`, `cron_expression`, `is_active`, `endpoint`, `payload`)
 * AND the legacy camelCase aliases used in earlier SDK versions
 * (`subscriptionName`, `payload`). Unknown keys are passed through verbatim
 * so future API fields don't require a client release.
 */
function toSubscriptionRequestBody(input: AnyRecord): AnyRecord {
  if (!input || typeof input !== "object") return {};
  const out: AnyRecord = {};

  const legacyName = (input as AnyRecord).subscriptionName;
  if (typeof legacyName === "string") {
    out.subscription_name = legacyName;
  }

  for (const [k, v] of Object.entries(input as AnyRecord)) {
    if (v === undefined) continue;
    if (k === "subscriptionName") continue; // already handled
    out[k] = v;
  }

  return out;
}

/**
 * Normalize a webhook-endpoint create/update input into the wire body.
 *
 * Accepts the canonical shape (`name`, `callback_url`, `is_active`) and the
 * legacy aliases (`callbackUrl`, `isActive`).
 */
function toEndpointRequestBody(input: AnyRecord): AnyRecord {
  if (!input || typeof input !== "object") return {};
  const out: AnyRecord = {};

  const rec = input as AnyRecord;
  if (typeof rec.callbackUrl === "string") out.callback_url = rec.callbackUrl;
  if (typeof rec.isActive === "boolean") out.is_active = rec.isActive;

  for (const [k, v] of Object.entries(rec)) {
    if (v === undefined) continue;
    if (k === "callbackUrl" || k === "isActive") continue;
    out[k] = v;
  }

  return out;
}

function buildPaginatedResponse<T = AnyRecord>(raw: AnyRecord): PaginatedResponse<T> {
  const results = Array.isArray(raw?.results) ? (raw.results as T[]) : [];
  const rawCount = raw?.count;
  const count = typeof rawCount === "number" ? rawCount : Number.isFinite(Number(rawCount)) ? Number(rawCount) : results.length;

  const nextVal = raw?.next;
  const previousVal = raw?.previous;
  const pageMetadataVal = raw?.page_metadata;

  const next = typeof nextVal === "string" ? nextVal : null;
  const previous = typeof previousVal === "string" ? previousVal : null;
  const pageMetadata = isRecord(pageMetadataVal) ? pageMetadataVal : null;

  return {
    count,
    next,
    previous,
    pageMetadata,
    results,
  };
}

/**
 * Normalize contract filters:
 * - Map high-level parameter names to API query parameters.
 * - Convert sort + order -> ordering.
 * - Remove pagination / shape-related keys (handled separately).
 */
function buildContractFilterParams(filterObj: AnyRecord): AnyRecord {
  const filterParams: AnyRecord = { ...(filterObj ?? {}) };
  const apiParams: AnyRecord = {};

  // Remove shape-related + pagination params; handled separately
  delete filterParams.shape;
  delete filterParams.flat;
  delete filterParams.flat_lists;
  delete filterParams.flatLists;
  delete filterParams.page;
  delete filterParams.limit;

  const apiParamMapping: Record<string, string> = {
    naics_code: "naics",
    keyword: "search",
    psc_code: "psc",
    recipient_name: "recipient",
    recipient_uei: "uei",
    set_aside_type: "set_aside",
  };

  const sortField = filterParams.sort as string | undefined;
  const sortOrder = filterParams.order as string | undefined;
  delete filterParams.sort;
  delete filterParams.order;

  if (sortField) {
    const prefix = sortOrder === "desc" ? "-" : "";
    apiParams.ordering = `${prefix}${sortField}`;
  }

  for (const [key, value] of Object.entries(filterParams)) {
    if (value === undefined || value === null) continue;
    const apiKey = apiParamMapping[key] ?? key;
    apiParams[apiKey] = value;
  }

  return apiParams;
}

export interface ListOptionsBase {
  page?: number;
  limit?: number;
  shape?: string | null;
  flat?: boolean;
  flatLists?: boolean;
}

export interface ListContractsOptions extends ListOptionsBase {
  filters?: AnyRecord;
  [key: string]: unknown;
}

export interface ListEntitiesOptions extends ListOptionsBase {
  search?: string;
  [key: string]: unknown;
}

export interface ListWebhookSubscriptionsOptions {
  page?: number;
  pageSize?: number;
}

export interface ListVehiclesOptions extends ListOptionsBase {
  search?: string;
  [key: string]: unknown;
}

export interface ListIdvsOptions {
  limit?: number;
  cursor?: string | null;
  shape?: string | null;
  flat?: boolean;
  flatLists?: boolean;
  joiner?: string;
  [key: string]: unknown;
}

export class TangoClient {
  private readonly http: HttpClient;
  private readonly shapeParser: ShapeParser;
  private readonly modelFactory: ModelFactory;

  constructor(options: TangoClientOptions = {}) {
    const { apiKey, baseUrl = DEFAULT_BASE_URL, timeoutMs = 30000, fetchImpl } = options;

    let envKey: string | null = null;
    try {
      // In some environments process may not exist (e.g. browser), so guard it.
      if (typeof process !== "undefined" && process.env && process.env.TANGO_API_KEY) {
        envKey = process.env.TANGO_API_KEY ?? null;
      }
    } catch {
      // ignore
    }

    const keyToUse = apiKey ?? envKey ?? null;

    this.http = new HttpClient({
      baseUrl,
      apiKey: keyToUse,
      timeoutMs,
      fetchImpl,
    });

    this.shapeParser = new ShapeParser();
    this.modelFactory = new ModelFactory();
  }

  // ---------------------------------------------------------------------------
  // Agencies
  // ---------------------------------------------------------------------------

  async listAgencies(options: { page?: number; limit?: number } = {}): Promise<PaginatedResponse<AnyRecord>> {
    const { page = 1, limit = 25 } = options;
    const params: AnyRecord = {
      page,
      limit: Math.min(limit, 100),
    };

    const data = await this.http.get<AnyRecord>("/api/agencies/", params);
    return buildPaginatedResponse<AnyRecord>(data);
  }

  async getAgency(code: string): Promise<AnyRecord> {
    if (!code) {
      throw new TangoValidationError("Agency code is required");
    }

    const data = await this.http.get<AnyRecord>(`/api/agencies/${encodeURIComponent(code)}/`);

    if (!data) {
      throw new TangoNotFoundError(`Agency '${code}' not found`, 404, data);
    }

    // In the Python client, this is normalized into an Agency model; here we return the raw payload.
    return data;
  }

  async listBusinessTypes(options: { page?: number; limit?: number } = {}): Promise<PaginatedResponse<AnyRecord>> {
    const { page = 1, limit = 25 } = options;
    const params: AnyRecord = {
      page,
      limit: Math.min(limit, 100),
    };

    const data = await this.http.get<AnyRecord>("/api/business_types/", params);
    return buildPaginatedResponse<AnyRecord>(data);
  }

  // ---------------------------------------------------------------------------
  // Contracts
  // ---------------------------------------------------------------------------

  async listContracts(options: ListContractsOptions = {}): Promise<PaginatedResponse<Record<string, unknown>>> {
    const { page = 1, limit = 25, shape, flat = false, flatLists = false, filters = {}, ...restFilters } = options;

    const params: AnyRecord = {
      page,
      limit: Math.min(limit, 100),
    };

    const shapeToUse = shape ?? ShapeConfig.CONTRACTS_MINIMAL;
    const shapeSpec = this.parseShape(shapeToUse, flat, flatLists);
    if (shapeToUse) {
      params.shape = shapeToUse;
      if (flat) {
        params.flat = "true";
      }
      if (flatLists) {
        params.flat_lists = "true";
      }
    }

    const mergedFilters: AnyRecord = { ...(filters ?? {}), ...restFilters };
    const apiFilterParams = buildContractFilterParams(mergedFilters);
    Object.assign(params, apiFilterParams);

    const data = await this.http.get<AnyRecord>("/api/contracts/", params);
    const rawResults = Array.isArray(data?.results) ? (data.results as AnyRecord[]) : [];

    const results = this.materializeList("Contract", shapeSpec, rawResults, flat);

    const paginated = buildPaginatedResponse<AnyRecord>({ ...data, results } as AnyRecord);

    return paginated;
  }

  // ---------------------------------------------------------------------------
  // Entities
  // ---------------------------------------------------------------------------

  async listEntities(options: ListEntitiesOptions = {}): Promise<PaginatedResponse<Record<string, unknown>>> {
    const { page = 1, limit = 25, shape, flat = false, flatLists = false, search, ...filters } = options;

    const params: AnyRecord = {
      page,
      limit: Math.min(limit, 100),
    };

    const shapeToUse = shape ?? ShapeConfig.ENTITIES_MINIMAL;
    const shapeSpec = this.parseShape(shapeToUse, flat, flatLists);
    if (shapeToUse) {
      params.shape = shapeToUse;
      if (flat) {
        params.flat = "true";
      }
      if (flatLists) {
        params.flat_lists = "true";
      }
    }

    if (search) {
      params.search = search;
    }

    Object.assign(params, filters);

    const data = await this.http.get<AnyRecord>("/api/entities/", params);
    const rawResults = Array.isArray(data?.results) ? (data.results as AnyRecord[]) : [];

    const results = this.materializeList("Entity", shapeSpec, rawResults, flat);

    const paginated = buildPaginatedResponse<AnyRecord>({ ...data, results } as AnyRecord);

    return paginated;
  }

  async getEntity(key: string, options: { shape?: string | null; flat?: boolean; flatLists?: boolean } = {}): Promise<Record<string, unknown>> {
    if (!key) {
      throw new TangoValidationError("Entity key (UEI or CAGE) is required");
    }

    const { shape, flat = false, flatLists = false } = options;
    const params: AnyRecord = {};

    const shapeToUse = shape ?? ShapeConfig.ENTITIES_COMPREHENSIVE;
    const shapeSpec = this.parseShape(shapeToUse, flat, flatLists);
    if (shapeToUse) {
      params.shape = shapeToUse;
      if (flat) {
        params.flat = "true";
      }
      if (flatLists) {
        params.flat_lists = "true";
      }
    }

    const data = await this.http.get<AnyRecord>(`/api/entities/${encodeURIComponent(key)}/`, params);

    const result = this.materializeOne("Entity", shapeSpec, data, flat);
    return result as Record<string, unknown>;
  }

  // ---------------------------------------------------------------------------
  // Forecasts
  // ---------------------------------------------------------------------------

  async listForecasts(options: ListOptionsBase & Record<string, unknown> = {}): Promise<PaginatedResponse<Record<string, unknown>>> {
    const { page = 1, limit = 25, shape, flat = false, flatLists = false, ...filters } = options;

    const params: AnyRecord = {
      page,
      limit: Math.min(limit, 100),
    };

    const shapeToUse = shape ?? ShapeConfig.FORECASTS_MINIMAL;
    const shapeSpec = this.parseShape(shapeToUse, flat, flatLists);
    if (shapeToUse) {
      params.shape = shapeToUse;
      if (flat) params.flat = "true";
      if (flatLists) params.flat_lists = "true";
    }

    Object.assign(params, filters);

    const data = await this.http.get<AnyRecord>("/api/forecasts/", params);
    const rawResults = Array.isArray(data?.results) ? (data.results as AnyRecord[]) : [];

    const results = this.materializeList("Forecast", shapeSpec, rawResults, flat);

    const paginated = buildPaginatedResponse<AnyRecord>({ ...data, results } as AnyRecord);

    return paginated;
  }

  // ---------------------------------------------------------------------------
  // Opportunities
  // ---------------------------------------------------------------------------

  async listOpportunities(options: ListOptionsBase & Record<string, unknown> = {}): Promise<PaginatedResponse<Record<string, unknown>>> {
    const { page = 1, limit = 25, shape, flat = false, flatLists = false, ...filters } = options;

    const params: AnyRecord = {
      page,
      limit: Math.min(limit, 100),
    };

    const shapeToUse = shape ?? ShapeConfig.OPPORTUNITIES_MINIMAL;
    const shapeSpec = this.parseShape(shapeToUse, flat, flatLists);
    if (shapeToUse) {
      params.shape = shapeToUse;
      if (flat) params.flat = "true";
      if (flatLists) params.flat_lists = "true";
    }

    Object.assign(params, filters);

    const data = await this.http.get<AnyRecord>("/api/opportunities/", params);
    const rawResults = Array.isArray(data?.results) ? (data.results as AnyRecord[]) : [];

    const results = this.materializeList("Opportunity", shapeSpec, rawResults, flat);

    const paginated = buildPaginatedResponse<AnyRecord>({ ...data, results } as AnyRecord);

    return paginated;
  }

  // ---------------------------------------------------------------------------
  // Notices
  // ---------------------------------------------------------------------------

  async listNotices(options: ListOptionsBase & Record<string, unknown> = {}): Promise<PaginatedResponse<Record<string, unknown>>> {
    const { page = 1, limit = 25, shape, flat = false, flatLists = false, ...filters } = options;

    const params: AnyRecord = {
      page,
      limit: Math.min(limit, 100),
    };

    const shapeToUse = shape ?? ShapeConfig.NOTICES_MINIMAL;
    const shapeSpec = this.parseShape(shapeToUse, flat, flatLists);
    if (shapeToUse) {
      params.shape = shapeToUse;
      if (flat) params.flat = "true";
      if (flatLists) params.flat_lists = "true";
    }

    Object.assign(params, filters);

    const data = await this.http.get<AnyRecord>("/api/notices/", params);
    const rawResults = Array.isArray(data?.results) ? (data.results as AnyRecord[]) : [];

    const results = this.materializeList("Notice", shapeSpec, rawResults, flat);

    const paginated = buildPaginatedResponse<AnyRecord>({ ...data, results } as AnyRecord);

    return paginated;
  }

  // ---------------------------------------------------------------------------
  // Grants
  // ---------------------------------------------------------------------------

  async listGrants(options: ListOptionsBase & Record<string, unknown> = {}): Promise<PaginatedResponse<Record<string, unknown>>> {
    const { page = 1, limit = 25, shape, flat = false, flatLists = false, ...filters } = options;

    const params: AnyRecord = {
      page,
      limit: Math.min(limit, 100),
    };

    const shapeToUse = shape ?? ShapeConfig.GRANTS_MINIMAL;
    const shapeSpec = this.parseShape(shapeToUse, flat, flatLists);
    if (shapeToUse) {
      params.shape = shapeToUse;
      if (flat) params.flat = "true";
      if (flatLists) params.flat_lists = "true";
    }

    Object.assign(params, filters);

    const data = await this.http.get<AnyRecord>("/api/grants/", params);
    const rawResults = Array.isArray(data?.results) ? (data.results as AnyRecord[]) : [];

    const results = this.materializeList("Grant", shapeSpec, rawResults, flat);

    const paginated = buildPaginatedResponse<AnyRecord>({ ...data, results } as AnyRecord);

    return paginated;
  }

  // ---------------------------------------------------------------------------
  // Vehicles (Awards)
  // ---------------------------------------------------------------------------

  async listVehicles(options: ListVehiclesOptions = {}): Promise<PaginatedResponse<Record<string, unknown>>> {
    const { page = 1, limit = 25, shape, flat = false, flatLists = false, search, ...filters } = options;

    const params: AnyRecord = {
      page,
      limit: Math.min(limit, 100),
    };

    const shapeToUse = shape ?? ShapeConfig.VEHICLES_MINIMAL;
    const shapeSpec = this.parseShape(shapeToUse, flat, flatLists);
    if (shapeToUse) {
      params.shape = shapeToUse;
      if (flat) params.flat = "true";
      if (flatLists) params.flat_lists = "true";
    }

    if (search) {
      params.search = search;
    }

    // Vehicles list currently supports `search` + pagination + shaping. We allow extra keys for forward compatibility.
    Object.assign(params, filters);

    const data = await this.http.get<AnyRecord>("/api/vehicles/", params);
    const rawResults = Array.isArray(data?.results) ? (data.results as AnyRecord[]) : [];

    const results = this.materializeList("Vehicle", shapeSpec, rawResults, flat);

    return buildPaginatedResponse<AnyRecord>({ ...data, results } as AnyRecord);
  }

  async getVehicle(
    uuid: string,
    options: { shape?: string | null; flat?: boolean; flatLists?: boolean; joiner?: string; search?: string } = {},
  ): Promise<Record<string, unknown>> {
    if (!uuid) {
      throw new TangoValidationError("Vehicle uuid is required");
    }

    const { shape, flat = false, flatLists = false, joiner = ".", search } = options;
    const params: AnyRecord = {};

    const shapeToUse = shape ?? ShapeConfig.VEHICLES_COMPREHENSIVE;
    const shapeSpec = this.parseShape(shapeToUse, flat, flatLists);
    if (shapeToUse) {
      params.shape = shapeToUse;
      if (flat) {
        params.flat = "true";
        if (joiner) params.joiner = joiner;
      }
      if (flatLists) params.flat_lists = "true";
    }

    // On vehicle detail, `search` filters expanded awardees when shaping includes `awardees(...)`.
    if (search) {
      params.search = search;
    }

    const data = await this.http.get<AnyRecord>(`/api/vehicles/${encodeURIComponent(uuid)}/`, params);

    const result = this.materializeOne("Vehicle", shapeSpec, data, flat, joiner);
    return result as Record<string, unknown>;
  }

  async listVehicleAwardees(
    uuid: string,
    options: { page?: number; limit?: number; shape?: string | null; flat?: boolean; flatLists?: boolean; joiner?: string } = {},
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    if (!uuid) {
      throw new TangoValidationError("Vehicle uuid is required");
    }

    const { page = 1, limit = 25, shape, flat = false, flatLists = false, joiner = "." } = options;

    const params: AnyRecord = {
      page,
      limit: Math.min(limit, 100),
    };

    const shapeToUse = shape ?? ShapeConfig.VEHICLE_AWARDEES_MINIMAL;
    const shapeSpec = this.parseShape(shapeToUse, flat, flatLists);
    if (shapeToUse) {
      params.shape = shapeToUse;
      if (flat) {
        params.flat = "true";
        if (joiner) params.joiner = joiner;
      }
      if (flatLists) params.flat_lists = "true";
    }

    const data = await this.http.get<AnyRecord>(`/api/vehicles/${encodeURIComponent(uuid)}/awardees/`, params);
    const rawResults = Array.isArray(data?.results) ? (data.results as AnyRecord[]) : [];

    const results = this.materializeList("IDV", shapeSpec, rawResults, flat, joiner);

    return buildPaginatedResponse<AnyRecord>({ ...data, results } as AnyRecord);
  }

  // ---------------------------------------------------------------------------
  // IDVs (Awards)
  // ---------------------------------------------------------------------------

  async listIdvs(options: ListIdvsOptions = {}): Promise<PaginatedResponse<Record<string, unknown>>> {
    const { limit = 25, cursor = null, shape, flat = false, flatLists = false, joiner = ".", ...filters } = options;

    const params: AnyRecord = {
      limit: Math.min(limit, 100),
    };
    if (cursor) params.cursor = cursor;

    const shapeToUse = shape ?? ShapeConfig.IDVS_MINIMAL;
    const shapeSpec = this.parseShape(shapeToUse, flat, flatLists);
    if (shapeToUse) {
      params.shape = shapeToUse;
      if (flat) {
        params.flat = "true";
        if (joiner) params.joiner = joiner;
      }
      if (flatLists) params.flat_lists = "true";
    }

    Object.assign(params, filters);

    const data = await this.http.get<AnyRecord>("/api/idvs/", params);
    const rawResults = Array.isArray(data?.results) ? (data.results as AnyRecord[]) : [];

    const results = this.materializeList("IDV", shapeSpec, rawResults, flat, joiner);
    return buildPaginatedResponse<AnyRecord>({ ...data, results } as AnyRecord);
  }

  async getIdv(
    key: string,
    options: { shape?: string | null; flat?: boolean; flatLists?: boolean; joiner?: string } = {},
  ): Promise<Record<string, unknown>> {
    if (!key) {
      throw new TangoValidationError("IDV key is required");
    }

    const { shape, flat = false, flatLists = false, joiner = "." } = options;
    const params: AnyRecord = {};

    const shapeToUse = shape ?? ShapeConfig.IDVS_COMPREHENSIVE;
    const shapeSpec = this.parseShape(shapeToUse, flat, flatLists);
    if (shapeToUse) {
      params.shape = shapeToUse;
      if (flat) {
        params.flat = "true";
        if (joiner) params.joiner = joiner;
      }
      if (flatLists) params.flat_lists = "true";
    }

    const data = await this.http.get<AnyRecord>(`/api/idvs/${encodeURIComponent(key)}/`, params);

    const result = this.materializeOne("IDV", shapeSpec, data, flat, joiner);
    return result as Record<string, unknown>;
  }

  async listIdvAwards(
    key: string,
    options: ListContractsOptions & { cursor?: string | null; joiner?: string } = {},
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    if (!key) {
      throw new TangoValidationError("IDV key is required");
    }

    const { limit = 25, cursor = null, shape, flat = false, flatLists = false, joiner = ".", filters = {}, ...restFilters } = options;

    const params: AnyRecord = {
      limit: Math.min(limit, 100),
    };
    if (cursor) params.cursor = cursor;

    const shapeToUse = shape ?? ShapeConfig.CONTRACTS_MINIMAL;
    const shapeSpec = this.parseShape(shapeToUse, flat, flatLists);
    if (shapeToUse) {
      params.shape = shapeToUse;
      if (flat) {
        params.flat = "true";
        if (joiner) params.joiner = joiner;
      }
      if (flatLists) params.flat_lists = "true";
    }

    const mergedFilters: AnyRecord = { ...(filters ?? {}), ...restFilters };
    const apiFilterParams = buildContractFilterParams(mergedFilters);
    Object.assign(params, apiFilterParams);

    const data = await this.http.get<AnyRecord>(`/api/idvs/${encodeURIComponent(key)}/awards/`, params);
    const rawResults = Array.isArray(data?.results) ? (data.results as AnyRecord[]) : [];

    const results = this.materializeList("Contract", shapeSpec, rawResults, flat, joiner);
    return buildPaginatedResponse<AnyRecord>({ ...data, results } as AnyRecord);
  }

  async listIdvChildIdvs(options: { key: string } & ListIdvsOptions): Promise<PaginatedResponse<Record<string, unknown>>> {
    const { key, ...rest } = options;
    if (!key) {
      throw new TangoValidationError("IDV key is required");
    }

    const { limit = 25, cursor = null, shape, flat = false, flatLists = false, joiner = ".", ...filters } = rest;

    const params: AnyRecord = {
      limit: Math.min(limit, 100),
    };
    if (cursor) params.cursor = cursor;

    const shapeToUse = shape ?? ShapeConfig.IDVS_MINIMAL;
    const shapeSpec = this.parseShape(shapeToUse, flat, flatLists);
    if (shapeToUse) {
      params.shape = shapeToUse;
      if (flat) {
        params.flat = "true";
        if (joiner) params.joiner = joiner;
      }
      if (flatLists) params.flat_lists = "true";
    }

    Object.assign(params, filters);

    const data = await this.http.get<AnyRecord>(`/api/idvs/${encodeURIComponent(key)}/idvs/`, params);
    const rawResults = Array.isArray(data?.results) ? (data.results as AnyRecord[]) : [];

    const results = this.materializeList("IDV", shapeSpec, rawResults, flat, joiner);
    return buildPaginatedResponse<AnyRecord>({ ...data, results } as AnyRecord);
  }

  async listIdvTransactions(
    key: string,
    options: { limit?: number; cursor?: string | null } = {},
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    if (!key) {
      throw new TangoValidationError("IDV key is required");
    }

    const { limit = 100, cursor = null } = options;
    const params: AnyRecord = { limit: Math.min(limit, 500) };
    if (cursor) params.cursor = cursor;

    const data = await this.http.get<AnyRecord>(`/api/idvs/${encodeURIComponent(key)}/transactions/`, params);
    return buildPaginatedResponse<Record<string, unknown>>(data);
  }

  async getIdvSummary(identifier: string): Promise<Record<string, unknown>> {
    if (!identifier) {
      throw new TangoValidationError("IDV solicitation identifier is required");
    }
    return await this.http.get<AnyRecord>(`/api/idvs/${encodeURIComponent(identifier)}/summary/`);
  }

  async listIdvSummaryAwards(
    identifier: string,
    options: { limit?: number; cursor?: string | null; ordering?: string } = {},
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    if (!identifier) {
      throw new TangoValidationError("IDV solicitation identifier is required");
    }

    const { limit = 25, cursor = null, ordering } = options;
    const params: AnyRecord = { limit: Math.min(limit, 100) };
    if (cursor) params.cursor = cursor;
    if (ordering) params.ordering = ordering;

    const data = await this.http.get<AnyRecord>(`/api/idvs/${encodeURIComponent(identifier)}/summary/awards/`, params);
    return buildPaginatedResponse<Record<string, unknown>>(data);
  }

  // ---------------------------------------------------------------------------
  // Webhooks (v2)
  // ---------------------------------------------------------------------------

  async listWebhookEventTypes(): Promise<WebhookEventTypesResponse> {
    return await this.http.get<WebhookEventTypesResponse>("/api/webhooks/event-types/");
  }

  async listWebhookSubscriptions(options: ListWebhookSubscriptionsOptions = {}): Promise<PaginatedResponse<WebhookSubscription>> {
    const { page = 1, pageSize } = options;
    const params: AnyRecord = { page };
    if (pageSize !== undefined) params.page_size = pageSize;

    const data = await this.http.get<AnyRecord>("/api/webhooks/subscriptions/", params);
    return buildPaginatedResponse<WebhookSubscription>(data);
  }

  async getWebhookSubscription(id: string): Promise<WebhookSubscription> {
    if (!id) throw new TangoValidationError("Webhook subscription id is required");
    return await this.http.get<WebhookSubscription>(`/api/webhooks/subscriptions/${encodeURIComponent(id)}/`);
  }

  /**
   * Create a webhook subscription.
   *
   * Accepts the canonical API shape (snake_case fields like `subscription_name`,
   * `subject_type`, `subject_ids`, `query_type`, `filter_definition`, ...) and
   * also accepts the legacy SDK shape `{ subscriptionName, payload }` for
   * backward compatibility.
   *
   * For `subscription_type: "subject"` provide `event_type` + `subject_type` +
   * `subject_ids`. For `subscription_type: "filter"` provide `event_type` (or
   * leave the API to derive) plus `query_type` (SINGULAR, e.g. `"contract"`)
   * and `filter_definition`.
   *
   * The canonical endpoint expects the `endpoint` (UUID) field on subject
   * subscriptions; this is required by the API.
   */
  async createWebhookSubscription(
    input: WebhookSubscriptionCreateInput | { subscriptionName: string; payload: WebhookSubscriptionPayload },
  ): Promise<WebhookSubscription> {
    const body = toSubscriptionRequestBody(input as AnyRecord);
    if (!body.subscription_name) {
      throw new TangoValidationError("Webhook subscription_name is required");
    }
    return await this.http.post<WebhookSubscription>("/api/webhooks/subscriptions/", body);
  }

  async updateWebhookSubscription(
    id: string,
    patch: WebhookSubscriptionUpdateInput | { subscriptionName?: string; payload?: WebhookSubscriptionPayload },
  ): Promise<WebhookSubscription> {
    if (!id) throw new TangoValidationError("Webhook subscription id is required");
    const body = toSubscriptionRequestBody(patch as AnyRecord);
    return await this.http.patch<WebhookSubscription>(`/api/webhooks/subscriptions/${encodeURIComponent(id)}/`, body);
  }

  async deleteWebhookSubscription(id: string): Promise<void> {
    if (!id) throw new TangoValidationError("Webhook subscription id is required");
    await this.http.delete(`/api/webhooks/subscriptions/${encodeURIComponent(id)}/`);
  }

  async listWebhookEndpoints(options: { page?: number; limit?: number } = {}): Promise<PaginatedResponse<WebhookEndpoint>> {
    const { page = 1, limit = 25 } = options;
    const params: AnyRecord = { page, limit: Math.min(limit, 100) };
    const data = await this.http.get<AnyRecord>("/api/webhooks/endpoints/", params);

    // Endpoints are commonly paginated like other Tango resources, but keep this resilient.
    if (Array.isArray(data)) {
      return { count: data.length, next: null, previous: null, pageMetadata: null, results: data as WebhookEndpoint[] };
    }
    return buildPaginatedResponse<WebhookEndpoint>(data);
  }

  async getWebhookEndpoint(id: string): Promise<WebhookEndpoint> {
    if (!id) throw new TangoValidationError("Webhook endpoint id is required");
    return await this.http.get<WebhookEndpoint>(`/api/webhooks/endpoints/${encodeURIComponent(id)}/`);
  }

  /**
   * Create a webhook endpoint.
   *
   * Accepts canonical `{ name, callback_url, is_active }` and the legacy SDK
   * shape `{ callbackUrl, isActive }`. `name` is required by the API; if not
   * given via the canonical shape, falls back to the URL host as a sensible
   * default rather than failing.
   */
  async createWebhookEndpoint(
    input: WebhookEndpointCreateInput | { callbackUrl: string; isActive?: boolean; name?: string },
  ): Promise<WebhookEndpoint> {
    const body = toEndpointRequestBody(input as AnyRecord);
    if (!body.callback_url) {
      throw new TangoValidationError("Webhook callback_url is required");
    }
    if (!body.name) {
      try {
        body.name = new URL(body.callback_url as string).host || "endpoint";
      } catch {
        body.name = "endpoint";
      }
    }
    // Preserve historical default for create: active endpoints unless caller opts out.
    if (body.is_active === undefined) {
      body.is_active = true;
    }
    return await this.http.post<WebhookEndpoint>("/api/webhooks/endpoints/", body);
  }

  async updateWebhookEndpoint(
    id: string,
    patch: WebhookEndpointUpdateInput | { callbackUrl?: string; isActive?: boolean; name?: string },
  ): Promise<WebhookEndpoint> {
    if (!id) throw new TangoValidationError("Webhook endpoint id is required");
    const body = toEndpointRequestBody(patch as AnyRecord);
    return await this.http.patch<WebhookEndpoint>(`/api/webhooks/endpoints/${encodeURIComponent(id)}/`, body);
  }

  async deleteWebhookEndpoint(id: string): Promise<void> {
    if (!id) throw new TangoValidationError("Webhook endpoint id is required");
    await this.http.delete(`/api/webhooks/endpoints/${encodeURIComponent(id)}/`);
  }

  /**
   * Trigger a test delivery against an endpoint.
   *
   * NOTE: the request body key here is `endpoint_id` — different from the
   * subscriptions endpoint, which takes `endpoint`. This reflects an
   * inconsistency in the Tango API itself.
   */
  async testWebhookEndpoint(endpointId: string): Promise<WebhookTestDeliveryResult> {
    if (!endpointId) throw new TangoValidationError("endpointId is required");
    return await this.http.post<WebhookTestDeliveryResult>("/api/webhooks/endpoints/test-delivery/", {
      endpoint_id: endpointId,
    });
  }

  /**
   * Legacy alias for `testWebhookEndpoint`. Accepts an options bag for
   * historical reasons; `endpointId` may be omitted, in which case the API
   * auto-resolves the user's only endpoint (404 if 0, 400 if >1).
   */
  async testWebhookDelivery(options: { endpointId?: string } = {}): Promise<WebhookTestDeliveryResult> {
    const body: AnyRecord = {};
    if (options.endpointId) body.endpoint_id = options.endpointId;
    return await this.http.post<WebhookTestDeliveryResult>("/api/webhooks/endpoints/test-delivery/", body);
  }


  async getWebhookSamplePayload(options: { eventType?: string } = {}): Promise<WebhookSamplePayloadResponse> {
    const params: AnyRecord = {};
    if (options.eventType) params.event_type = options.eventType;
    return await this.http.get<WebhookSamplePayloadResponse>("/api/webhooks/endpoints/sample-payload/", params);
  }

  private parseShape(shape: string | null | undefined, flat: boolean, flatLists: boolean): ShapeSpec | null {
    if (!shape) return null;
    return this.shapeParser.parseWithFlags(shape, flat, flatLists);
  }

  private materializeList(baseModel: string, shapeSpec: ShapeSpec | null, rawItems: AnyRecord[], flat: boolean, joiner = "."): AnyRecord[] {
    const prepared = flat ? rawItems.map((item) => unflattenResponse(item, joiner)) : rawItems;
    if (!shapeSpec) return prepared;
    return this.modelFactory.createList(baseModel, shapeSpec, prepared);
  }

  private materializeOne(baseModel: string, shapeSpec: ShapeSpec | null, rawItem: AnyRecord, flat: boolean, joiner = "."): AnyRecord {
    const prepared = flat ? unflattenResponse(rawItem, joiner) : rawItem;
    if (!shapeSpec) return prepared;
    return this.modelFactory.createOne(baseModel, shapeSpec, prepared);
  }
}
