import { DEFAULT_BASE_URL, ShapeConfig } from "./config.js";
import { TangoNotFoundError, TangoValidationError } from "./errors.js";
import { ModelFactory } from "./shapes/factory.js";
import { ShapeParser } from "./shapes/parser.js";
import type { ShapeSpec } from "./shapes/types.js";
import { HttpClient } from "./utils/http.js";
import { unflattenResponse } from "./utils/unflatten.js";
import { PaginatedResponse, TangoClientOptions } from "./types.js";
import type {
  WebhookAlert,
  WebhookAlertCreateInput,
  WebhookEndpoint,
  WebhookEndpointCreateInput,
  WebhookEndpointUpdateInput,
  WebhookEventTypesResponse,
  WebhookSamplePayloadResponse,
  WebhookTestDeliveryResult,
} from "./models/Webhooks.js";

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

/**
 * List methods on `TangoClient` that `iterate()` knows how to drive. Every
 * entry must accept an options object and return a `PaginatedResponse<T>`
 * with a `next` URL containing either `?page=` or `?cursor=`.
 */
export type IterableListMethod =
  | "listContracts"
  | "listEntities"
  | "listOpportunities"
  | "listNotices"
  | "listGrants"
  | "listForecasts"
  | "listIdvs"
  | "listVehicles";

// ---------------------------------------------------------------------------
// Read-method option interfaces (lookups + awards completeness + other)
// ---------------------------------------------------------------------------

export interface ListNaicsOptions extends ListOptionsBase {
  search?: string;
  revenue_limit?: number | string;
  employee_limit?: number | string;
  revenue_limit_gte?: number | string;
  revenue_limit_lte?: number | string;
  employee_limit_gte?: number | string;
  employee_limit_lte?: number | string;
  [key: string]: unknown;
}

export interface ListPscOptions extends ListOptionsBase {
  [key: string]: unknown;
}

export interface ListMasSinsOptions extends ListOptionsBase {
  search?: string;
  [key: string]: unknown;
}

export interface ListAssistanceListingsOptions extends ListOptionsBase {
  [key: string]: unknown;
}

export interface ListOrganizationsOptions extends ListOptionsBase {
  search?: string;
  type?: string;
  level?: string | number;
  cgac?: string;
  parent?: string;
  include_inactive?: boolean;
  [key: string]: unknown;
}

export interface ListOfficesOptions extends ListOptionsBase {
  search?: string;
  [key: string]: unknown;
}

export interface ListDepartmentsOptions extends ListOptionsBase {
  [key: string]: unknown;
}

export interface ListOtasOptions extends ListOptionsBase {
  uei?: string;
  piid?: string;
  search?: string;
  awarding_agency?: string;
  funding_agency?: string;
  fiscal_year?: number | string;
  psc?: string;
  recipient?: string;
  ordering?: string;
  [key: string]: unknown;
}

export interface ListOtidvsOptions extends ListOtasOptions {
  [key: string]: unknown;
}

export interface ListOtidvAwardsOptions extends ListOtasOptions {
  [key: string]: unknown;
}

export interface ListSubawardsOptions extends ListOptionsBase {
  award_key?: string;
  prime_uei?: string;
  sub_uei?: string;
  awarding_agency?: string;
  funding_agency?: string;
  fiscal_year?: number | string;
  fiscal_year_gte?: number | string;
  fiscal_year_lte?: number | string;
  recipient?: string;
  ordering?: string;
  [key: string]: unknown;
}

export interface ListGsaElibraryContractsOptions extends ListOptionsBase {
  schedule?: string;
  contract_number?: string;
  key?: string;
  piid?: string;
  uei?: string;
  sin?: string;
  search?: string;
  ordering?: string;
  [key: string]: unknown;
}

export interface ListLcatsOptions {
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

export interface ListProtestsOptions {
  page?: number;
  limit?: number;
  source_system?: string;
  outcome?: string;
  case_type?: string;
  agency?: string;
  case_number?: string;
  solicitation_number?: string;
  protester?: string;
  search?: string;
  filed_date_after?: string;
  filed_date_before?: string;
  decision_date_after?: string;
  decision_date_before?: string;
  [key: string]: unknown;
}

export interface ListItDashboardOptions {
  page?: number;
  limit?: number;
  search?: string;
  agency_code?: string;
  agency_name?: string;
  type_of_investment?: string;
  updated_time_after?: string;
  updated_time_before?: string;
  cio_rating?: string | number;
  cio_rating_max?: string | number;
  performance_risk?: string | number;
  [key: string]: unknown;
}

/**
 * Metrics live under several owner types in the API:
 * `/api/naics/{code}/metrics/{months}/{period_grouping}/`
 * `/api/psc/{code}/metrics/{months}/{period_grouping}/`
 * `/api/entities/{uei}/metrics/{months}/{period_grouping}/`
 */
export interface ListMetricsOptions {
  ownerType: "naics" | "psc" | "entity";
  ownerId: string;
  months: number | string;
  periodGrouping: string;
  [key: string]: unknown;
}

export interface ResolveInput {
  name: string;
  target_type: "entity" | "organization";
  state?: string;
  city?: string;
  context?: string;
  [key: string]: unknown;
}

export interface ValidateInput {
  type: "piid" | "solicitation" | "uei";
  value: string;
}

// ---------------------------------------------------------------------------
// Entity / IDV / Agency sub-resource option interfaces
// ---------------------------------------------------------------------------

export interface EntitySubresourceOptions extends ListOptionsBase {
  cursor?: string | null;
  shape?: string | null;
  flat?: boolean;
  flatLists?: boolean;
  joiner?: string;
  ordering?: string;
  search?: string;
  [key: string]: unknown;
}

export interface EntitySubawardsOptions extends ListOptionsBase {
  shape?: string | null;
  flat?: boolean;
  flatLists?: boolean;
  ordering?: string;
  [key: string]: unknown;
}

export interface EntityLcatsOptions extends ListOptionsBase {
  ordering?: string;
  search?: string;
  [key: string]: unknown;
}

export interface AgencyContractsOptions extends ListOptionsBase {
  cursor?: string | null;
  shape?: string | null;
  flat?: boolean;
  flatLists?: boolean;
  joiner?: string;
  ordering?: string;
  search?: string;
  [key: string]: unknown;
}

export interface SearchOpportunityAttachmentsOptions {
  q: string;
  topK?: number;
  includeExtractedText?: boolean;
}

export class TangoClient {
  private readonly http: HttpClient;
  private readonly shapeParser: ShapeParser;
  private readonly modelFactory: ModelFactory;

  constructor(options: TangoClientOptions = {}) {
    const { apiKey, baseUrl, timeoutMs, timeout, fetchImpl, retries = 3, retryBackoffMs = 250 } = options;

    let envKey: string | null = null;
    let envBaseUrl: string | null = null;
    try {
      // In some environments process may not exist (e.g. browser), so guard it.
      if (typeof process !== "undefined" && process.env) {
        envKey = process.env.TANGO_API_KEY ?? null;
        envBaseUrl = process.env.TANGO_BASE_URL ?? null;
      }
    } catch {
      // ignore
    }

    const keyToUse = apiKey ?? envKey ?? null;
    // Precedence: explicit `baseUrl` option > `TANGO_BASE_URL` env > default.
    const baseUrlToUse = baseUrl ?? envBaseUrl ?? DEFAULT_BASE_URL;

    // Accept either `timeoutMs` (canonical) or `timeout` (shorthand) — both in ms.
    // If both are supplied, the canonical name wins.
    const resolvedTimeoutMs = timeoutMs ?? timeout ?? 30000;

    this.http = new HttpClient({
      baseUrl: baseUrlToUse,
      apiKey: keyToUse,
      timeoutMs: resolvedTimeoutMs,
      fetchImpl,
      retries,
      retryBackoffMs,
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

  // ---------------------------------------------------------------------------
  // Webhook Alerts (filter-subscription convenience API)
  // ---------------------------------------------------------------------------

  /**
   * Create a filter-based subscription via the alerts API.
   *
   * `query_type` is SINGULAR (e.g. `"contract"`, not `"contracts"`).
   */
  async createWebhookAlert(input: WebhookAlertCreateInput): Promise<WebhookAlert> {
    if (!input?.name) throw new TangoValidationError("Webhook alert name is required");
    if (!input.query_type) throw new TangoValidationError('Webhook alert query_type is required (singular, e.g. "contract")');
    if (!input.filters || typeof input.filters !== "object") {
      throw new TangoValidationError("Webhook alert filters must be a non-empty object");
    }

    const body: AnyRecord = {
      name: input.name,
      query_type: input.query_type,
      filters: input.filters,
    };
    if (input.frequency !== undefined) body.frequency = input.frequency;
    if (input.cron_expression !== undefined) body.cron_expression = input.cron_expression;

    return await this.http.post<WebhookAlert>("/api/webhooks/alerts/", body);
  }

  async deleteWebhookAlert(id: string): Promise<void> {
    if (!id) throw new TangoValidationError("Webhook alert id is required");
    await this.http.delete(`/api/webhooks/alerts/${encodeURIComponent(id)}/`);
  }

  async getWebhookSamplePayload(options: { eventType?: string } = {}): Promise<WebhookSamplePayloadResponse> {
    const params: AnyRecord = {};
    if (options.eventType) params.event_type = options.eventType;
    return await this.http.get<WebhookSamplePayloadResponse>("/api/webhooks/endpoints/sample-payload/", params);
  }

  // ---------------------------------------------------------------------------
  // Async iteration helpers
  //
  // Sequential by design — Tango rate limits would crush concurrent paginate,
  // and serial matches user expectations for `for await`. Each iterator follows
  // either offset-based pagination (page / limit) or cursor-based (cursor /
  // limit) by inspecting the `next` URL returned by the API.
  // ---------------------------------------------------------------------------

  /**
   * Names of list methods that the generic iterator knows how to drive.
   * Adding a method here is sufficient to enable `client.iterate(name, opts)`.
   */
  // (Type only — not a runtime export.)
  // prettier-ignore

  /**
   * Iterate through every result of a paginated list endpoint.
   *
   * Walks pages serially (no concurrency) by following the API's `next` URL,
   * extracting `page` (offset-based) or `cursor` (cursor-based) and re-calling
   * the underlying method with the same caller options.
   *
   * Example:
   * ```ts
   * for await (const contract of client.iterate("listContracts", { awarding_agency: "9700" })) {
   *   console.log(contract.piid);
   * }
   * ```
   */
  async *iterate<T = AnyRecord>(
    method: IterableListMethod,
    options: AnyRecord = {},
  ): AsyncIterableIterator<T> {
    // Strip pagination cursors from the caller options — we manage them.
    const callerOptions: AnyRecord = { ...options };
    delete callerOptions.page;
    delete callerOptions.cursor;

    let nextPage: number | null = null;
    let nextCursor: string | null = null;

    while (true) {
      const pageOptions: AnyRecord = { ...callerOptions };
      if (nextPage !== null) pageOptions.page = nextPage;
      if (nextCursor !== null) pageOptions.cursor = nextCursor;

      type ListFn = (opts: AnyRecord) => Promise<PaginatedResponse<AnyRecord>>;
      const fn = (this as unknown as Record<string, unknown>)[method] as ListFn | undefined;
      if (typeof fn !== "function") {
        throw new TangoValidationError(`Unknown list method for iterate(): ${method}`);
      }
      const response = await fn.call(this, pageOptions);

      for (const item of response.results) {
        yield item as T;
      }

      const next = response.next;
      if (!next) return;

      // Pull `page` and `cursor` out of the next URL to drive the next request.
      // The API returns a fully qualified URL, but if anything weird comes back
      // (relative path, malformed) we stop rather than loop forever.
      let parsed: URL;
      try {
        parsed = new URL(next);
      } catch {
        return;
      }
      const pageParam = parsed.searchParams.get("page");
      const cursorParam = parsed.searchParams.get("cursor");

      if (cursorParam) {
        nextCursor = cursorParam;
        nextPage = null;
      } else if (pageParam) {
        const asInt = Number.parseInt(pageParam, 10);
        if (!Number.isFinite(asInt)) return;
        nextPage = asInt;
        nextCursor = null;
      } else {
        // No page or cursor in the next URL — nothing we can do to advance.
        return;
      }
    }
  }

  iterateContracts(options: ListContractsOptions = {}): AsyncIterableIterator<Record<string, unknown>> {
    return this.iterate<Record<string, unknown>>("listContracts", options as AnyRecord);
  }

  iterateEntities(options: ListEntitiesOptions = {}): AsyncIterableIterator<Record<string, unknown>> {
    return this.iterate<Record<string, unknown>>("listEntities", options as AnyRecord);
  }

  iterateOpportunities(options: ListOptionsBase & Record<string, unknown> = {}): AsyncIterableIterator<Record<string, unknown>> {
    return this.iterate<Record<string, unknown>>("listOpportunities", options as AnyRecord);
  }

  iterateNotices(options: ListOptionsBase & Record<string, unknown> = {}): AsyncIterableIterator<Record<string, unknown>> {
    return this.iterate<Record<string, unknown>>("listNotices", options as AnyRecord);
  }

  iterateGrants(options: ListOptionsBase & Record<string, unknown> = {}): AsyncIterableIterator<Record<string, unknown>> {
    return this.iterate<Record<string, unknown>>("listGrants", options as AnyRecord);
  }

  iterateForecasts(options: ListOptionsBase & Record<string, unknown> = {}): AsyncIterableIterator<Record<string, unknown>> {
    return this.iterate<Record<string, unknown>>("listForecasts", options as AnyRecord);
  }

  iterateIdvs(options: ListIdvsOptions = {}): AsyncIterableIterator<Record<string, unknown>> {
    return this.iterate<Record<string, unknown>>("listIdvs", options as AnyRecord);
  }

  iterateVehicles(options: ListVehiclesOptions = {}): AsyncIterableIterator<Record<string, unknown>> {
    return this.iterate<Record<string, unknown>>("listVehicles", options as AnyRecord);
  }

  // ---------------------------------------------------------------------------
  // Lookups
  // ---------------------------------------------------------------------------

  private async _genericPaginatedList(path: string, options: AnyRecord = {}): Promise<PaginatedResponse<AnyRecord>> {
    const { page = 1, limit = 25, shape, flat, flatLists, ...rest } = options;
    const params: AnyRecord = { page, limit: Math.min(Number(limit), 100) };
    if (shape) params.shape = shape;
    if (flat) params.flat = "true";
    if (flatLists) params.flat_lists = "true";
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null) params[k] = v;
    }
    const data = await this.http.get<AnyRecord>(path, params);
    return buildPaginatedResponse<AnyRecord>(data);
  }

  /** List NAICS codes. */
  async listNaics(options: ListNaicsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._genericPaginatedList("/api/naics/", options as AnyRecord);
  }

  /** Get a single NAICS code by its 6-digit code. */
  async getNaics(code: string): Promise<AnyRecord> {
    if (!code) throw new TangoValidationError("NAICS code is required");
    return await this.http.get<AnyRecord>(`/api/naics/${encodeURIComponent(code)}/`);
  }

  /** List PSC (Product/Service) codes. */
  async listPsc(options: ListPscOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._genericPaginatedList("/api/psc/", options as AnyRecord);
  }

  /** Get a single PSC code. */
  async getPsc(code: string): Promise<AnyRecord> {
    if (!code) throw new TangoValidationError("PSC code is required");
    return await this.http.get<AnyRecord>(`/api/psc/${encodeURIComponent(code)}/`);
  }

  /** List GSA MAS SINs. */
  async listMasSins(options: ListMasSinsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._genericPaginatedList("/api/mas_sins/", options as AnyRecord);
  }

  /** Get a single MAS SIN by its identifier. */
  async getMasSin(sin: string): Promise<AnyRecord> {
    if (!sin) throw new TangoValidationError("MAS SIN is required");
    return await this.http.get<AnyRecord>(`/api/mas_sins/${encodeURIComponent(sin)}/`);
  }

  /** List CFDA / Assistance Listings. */
  async listAssistanceListings(options: ListAssistanceListingsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._genericPaginatedList("/api/assistance_listings/", options as AnyRecord);
  }

  /** Get a single Assistance Listing by CFDA number. */
  async getAssistanceListing(number: string): Promise<AnyRecord> {
    if (!number) throw new TangoValidationError("Assistance listing number is required");
    return await this.http.get<AnyRecord>(`/api/assistance_listings/${encodeURIComponent(number)}/`);
  }

  /** List organizations (the canonical agency/dept/office hierarchy). */
  async listOrganizations(options: ListOrganizationsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._genericPaginatedList("/api/organizations/", options as AnyRecord);
  }

  /**
   * Get a single organization by identifier. The API accepts multiple identifier
   * shapes (CGAC, FPDS, short code, slug, etc.).
   */
  async getOrganization(identifier: string): Promise<AnyRecord> {
    if (!identifier) throw new TangoValidationError("Organization identifier is required");
    return await this.http.get<AnyRecord>(`/api/organizations/${encodeURIComponent(identifier)}/`);
  }

  /** List offices. */
  async listOffices(options: ListOfficesOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._genericPaginatedList("/api/offices/", options as AnyRecord);
  }

  /** Get a single office by code. */
  async getOffice(code: string): Promise<AnyRecord> {
    if (!code) throw new TangoValidationError("Office code is required");
    return await this.http.get<AnyRecord>(`/api/offices/${encodeURIComponent(code)}/`);
  }

  /**
   * List departments.
   *
   * @deprecated Use `listOrganizations({ level: 1 })` instead. The standalone
   * departments endpoint is retained for backward compatibility and will be
   * removed in a future API version. See #1461 (legacy agency tables retirement).
   */
  async listDepartments(options: ListDepartmentsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._genericPaginatedList("/api/departments/", options as AnyRecord);
  }

  // ---------------------------------------------------------------------------
  // Awards completeness: OTAs, OTIDVs, Subawards, GSA eLibrary, LCATs
  // ---------------------------------------------------------------------------

  /** List OTA (Other Transaction Authority) award actions. */
  async listOtas(options: ListOtasOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._genericPaginatedList("/api/otas/", options as AnyRecord);
  }

  /** Get a single OTA by its key. */
  async getOta(key: string): Promise<AnyRecord> {
    if (!key) throw new TangoValidationError("OTA key is required");
    return await this.http.get<AnyRecord>(`/api/otas/${encodeURIComponent(key)}/`);
  }

  /** List OTIDV (Other Transaction IDV) parents. */
  async listOtidvs(options: ListOtidvsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._genericPaginatedList("/api/otidvs/", options as AnyRecord);
  }

  /** Get a single OTIDV by its key. */
  async getOtidv(key: string): Promise<AnyRecord> {
    if (!key) throw new TangoValidationError("OTIDV key is required");
    return await this.http.get<AnyRecord>(`/api/otidvs/${encodeURIComponent(key)}/`);
  }

  /** List child awards under an OTIDV. */
  async listOtidvAwards(key: string, options: ListOtidvAwardsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    if (!key) throw new TangoValidationError("OTIDV key is required");
    return this._genericPaginatedList(`/api/otidvs/${encodeURIComponent(key)}/awards/`, options as AnyRecord);
  }

  /** List subawards (FSRS / USAspending-derived). */
  async listSubawards(options: ListSubawardsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._genericPaginatedList("/api/subawards/", options as AnyRecord);
  }

  /** List GSA eLibrary contracts. */
  async listGsaElibraryContracts(options: ListGsaElibraryContractsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._genericPaginatedList("/api/gsa_elibrary_contracts/", options as AnyRecord);
  }

  /**
   * List Labor Categories (LCATs) for an entity or IDV.
   *
   * LCATs live under owner resources in the API. Pass either:
   *   - `{ uei: "..." }` to fetch labor categories for an entity, or
   *   - `{ idvKey: "..." }` to fetch labor categories for an IDV.
   *
   * @example
   *   await client.listLcats({ uei: "ABCDEF123456" });
   *   await client.listLcats({ idvKey: "GS-00F-XXXX" });
   */
  async listLcats(options: ListLcatsOptions & { uei?: string; idvKey?: string }): Promise<PaginatedResponse<AnyRecord>> {
    const { uei, idvKey, ...rest } = options ?? {};
    if (!uei && !idvKey) {
      throw new TangoValidationError("listLcats requires either { uei } or { idvKey }");
    }
    const path = uei ? `/api/entities/${encodeURIComponent(uei)}/lcats/` : `/api/idvs/${encodeURIComponent(idvKey as string)}/lcats/`;
    return this._genericPaginatedList(path, rest as AnyRecord);
  }

  // ---------------------------------------------------------------------------
  // Protests + IT Dashboard + Metrics
  // ---------------------------------------------------------------------------

  /** List protests (GAO + CoFC). */
  async listProtests(options: ListProtestsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._genericPaginatedList("/api/protests/", options as AnyRecord);
  }

  /** Get a single protest by case number / id. */
  async getProtest(caseNumber: string): Promise<AnyRecord> {
    if (!caseNumber) throw new TangoValidationError("Protest case number is required");
    return await this.http.get<AnyRecord>(`/api/protests/${encodeURIComponent(caseNumber)}/`);
  }

  /** List IT Dashboard investments. */
  async listItDashboard(options: ListItDashboardOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._genericPaginatedList("/api/itdashboard/", options as AnyRecord);
  }

  /** Get a single IT Dashboard investment by UII. */
  async getItDashboard(uii: string): Promise<AnyRecord> {
    if (!uii) throw new TangoValidationError("IT Dashboard UII is required");
    return await this.http.get<AnyRecord>(`/api/itdashboard/${encodeURIComponent(uii)}/`);
  }

  /**
   * List metrics for an owner (NAICS, PSC, or entity).
   *
   * Metrics live under owner resources in Tango. Provide `ownerType`,
   * `ownerId`, `months`, and `periodGrouping`.
   *
   * @example
   *   await client.listMetrics({
   *     ownerType: "naics",
   *     ownerId: "541511",
   *     months: 12,
   *     periodGrouping: "month",
   *   });
   */
  async listMetrics(options: ListMetricsOptions): Promise<AnyRecord> {
    const { ownerType, ownerId, months, periodGrouping, ...rest } = options ?? ({} as ListMetricsOptions);
    if (!ownerType) throw new TangoValidationError("ownerType is required (naics | psc | entity)");
    if (!ownerId) throw new TangoValidationError("ownerId is required");
    if (months === undefined || months === null) throw new TangoValidationError("months is required");
    if (!periodGrouping) throw new TangoValidationError("periodGrouping is required");

    const ownerPath = ownerType === "entity" ? "entities" : ownerType;
    const path = `/api/${ownerPath}/${encodeURIComponent(ownerId)}/metrics/${encodeURIComponent(String(months))}/${encodeURIComponent(periodGrouping)}/`;

    const params: AnyRecord = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null) params[k] = v;
    }
    return await this.http.get<AnyRecord>(path, params);
  }

  // ---------------------------------------------------------------------------
  // Resolve + Validate (POST)
  // ---------------------------------------------------------------------------

  /**
   * Resolve a freeform name to candidate entities or organizations.
   *
   * @example
   *   await client.resolve({ name: "Lockheed Martin", target_type: "entity" });
   */
  async resolve(input: ResolveInput): Promise<{ candidates: AnyRecord[]; count: number; [key: string]: unknown }> {
    if (!input || !input.name) throw new TangoValidationError("resolve: 'name' is required");
    if (!input?.target_type) throw new TangoValidationError("resolve: 'target_type' is required");
    return await this.http.post("/api/resolve/", input);
  }

  /**
   * Validate an identifier (PIID, solicitation, or UEI) against Tango's records.
   *
   * @example
   *   await client.validate({ type: "uei", value: "ABCDEF123456" });
   */
  async validate(input: ValidateInput): Promise<AnyRecord> {
    if (!input || !input.type) throw new TangoValidationError("validate: 'type' is required");
    if (!input?.value) throw new TangoValidationError("validate: 'value' is required");
    return await this.http.post<AnyRecord>("/api/validate/", input);
  }

  // ---------------------------------------------------------------------------
  // Sub-detail methods (Department, BusinessType)
  // ---------------------------------------------------------------------------

  /** Get a single department by code. */
  async getDepartment(code: string): Promise<AnyRecord> {
    if (!code) throw new TangoValidationError("Department code is required");
    return await this.http.get<AnyRecord>(`/api/departments/${encodeURIComponent(code)}/`);
  }

  /** Get a single business type by code. */
  async getBusinessType(code: string): Promise<AnyRecord> {
    if (!code) throw new TangoValidationError("Business type code is required");
    return await this.http.get<AnyRecord>(`/api/business_types/${encodeURIComponent(code)}/`);
  }

  // ---------------------------------------------------------------------------
  // Entity sub-resources
  // ---------------------------------------------------------------------------

  private async _entitySubresource(uei: string, segment: string, options: EntitySubresourceOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    if (!uei) throw new TangoValidationError("UEI is required");
    const { limit = 25, cursor, shape, flat, flatLists, joiner, ordering, search, ...rest } = options;
    const params: AnyRecord = { limit: Math.min(Number(limit), 100) };
    if (cursor) params.cursor = cursor;
    if (shape) {
      params.shape = shape;
      if (flat) {
        params.flat = "true";
        if (joiner) params.joiner = joiner;
      }
      if (flatLists) params.flat_lists = "true";
    }
    if (ordering) params.ordering = ordering;
    if (search !== undefined) params.search = search;
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null) params[k] = v;
    }
    const data = await this.http.get<AnyRecord>(`/api/entities/${encodeURIComponent(uei)}/${segment}/`, params);
    return buildPaginatedResponse<AnyRecord>(data);
  }

  /** List contracts awarded to an entity (`/api/entities/{uei}/contracts/`). */
  async listEntityContracts(uei: string, options: EntitySubresourceOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._entitySubresource(uei, "contracts", options);
  }

  /** List IDVs held by an entity (`/api/entities/{uei}/idvs/`). */
  async listEntityIdvs(uei: string, options: EntitySubresourceOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._entitySubresource(uei, "idvs", options);
  }

  /** List OTAs held by an entity (`/api/entities/{uei}/otas/`). */
  async listEntityOtas(uei: string, options: EntitySubresourceOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._entitySubresource(uei, "otas", options);
  }

  /** List OTIDVs held by an entity (`/api/entities/{uei}/otidvs/`). */
  async listEntityOtidvs(uei: string, options: EntitySubresourceOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._entitySubresource(uei, "otidvs", options);
  }

  /** List subawards for an entity (`/api/entities/{uei}/subawards/`). */
  async listEntitySubawards(uei: string, options: EntitySubawardsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    if (!uei) throw new TangoValidationError("UEI is required");
    const { page = 1, limit = 25, shape, flat, flatLists, ordering, ...rest } = options;
    const params: AnyRecord = { page, limit: Math.min(Number(limit), 100) };
    if (shape) {
      params.shape = shape;
      if (flat) params.flat = "true";
      if (flatLists) params.flat_lists = "true";
    }
    if (ordering) params.ordering = ordering;
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null) params[k] = v;
    }
    const data = await this.http.get<AnyRecord>(`/api/entities/${encodeURIComponent(uei)}/subawards/`, params);
    return buildPaginatedResponse<AnyRecord>(data);
  }

  /** List Labor Categories (LCATs) for an entity (`/api/entities/{uei}/lcats/`). */
  async listEntityLcats(uei: string, options: EntityLcatsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    if (!uei) throw new TangoValidationError("UEI is required");
    return this._genericPaginatedList(`/api/entities/${encodeURIComponent(uei)}/lcats/`, options as AnyRecord);
  }

  /** Get rolling metrics for an entity (`/api/entities/{uei}/metrics/{months}/{periodGrouping}/`). */
  async getEntityMetrics(uei: string, months: number | string, periodGrouping: string): Promise<AnyRecord> {
    if (!uei) throw new TangoValidationError("UEI is required");
    if (months === undefined || months === null) throw new TangoValidationError("months is required");
    if (!periodGrouping) throw new TangoValidationError("periodGrouping is required");
    return await this.http.get<AnyRecord>(
      `/api/entities/${encodeURIComponent(uei)}/metrics/${encodeURIComponent(String(months))}/${encodeURIComponent(periodGrouping)}/`,
    );
  }

  // ---------------------------------------------------------------------------
  // IDV sub-resources
  // ---------------------------------------------------------------------------

  /** List Labor Categories under an IDV (`/api/idvs/{key}/lcats/`). */
  async listIdvLcats(key: string, options: EntityLcatsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    if (!key) throw new TangoValidationError("IDV key is required");
    return this._genericPaginatedList(`/api/idvs/${encodeURIComponent(key)}/lcats/`, options as AnyRecord);
  }

  // ---------------------------------------------------------------------------
  // Agency sub-resources
  // ---------------------------------------------------------------------------

  private async _agencyContracts(
    code: string,
    which: "awarding" | "funding",
    options: AgencyContractsOptions = {},
  ): Promise<PaginatedResponse<AnyRecord>> {
    if (!code) throw new TangoValidationError("Agency code is required");
    const { limit = 25, cursor, shape, flat, flatLists, joiner, ordering, search, ...rest } = options;
    const params: AnyRecord = { limit: Math.min(Number(limit), 100) };
    if (cursor) params.cursor = cursor;
    if (shape) {
      params.shape = shape;
      if (flat) {
        params.flat = "true";
        if (joiner) params.joiner = joiner;
      }
      if (flatLists) params.flat_lists = "true";
    }
    if (ordering) params.ordering = ordering;
    if (search !== undefined) params.search = search;
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined && v !== null) params[k] = v;
    }
    const data = await this.http.get<AnyRecord>(`/api/agencies/${encodeURIComponent(code)}/contracts/${which}/`, params);
    return buildPaginatedResponse<AnyRecord>(data);
  }

  /** List contracts where this agency is the awarding agency. */
  async listAgencyAwardingContracts(code: string, options: AgencyContractsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._agencyContracts(code, "awarding", options);
  }

  /** List contracts where this agency is the funding agency. */
  async listAgencyFundingContracts(code: string, options: AgencyContractsOptions = {}): Promise<PaginatedResponse<AnyRecord>> {
    return this._agencyContracts(code, "funding", options);
  }

  // ---------------------------------------------------------------------------
  // Typed metrics wrappers
  // ---------------------------------------------------------------------------

  /** Get rolling NAICS metrics (`/api/naics/{code}/metrics/{months}/{periodGrouping}/`). */
  async getNaicsMetrics(code: string, months: number | string, periodGrouping: string): Promise<AnyRecord> {
    if (!code) throw new TangoValidationError("NAICS code is required");
    if (months === undefined || months === null) throw new TangoValidationError("months is required");
    if (!periodGrouping) throw new TangoValidationError("periodGrouping is required");
    return await this.http.get<AnyRecord>(
      `/api/naics/${encodeURIComponent(code)}/metrics/${encodeURIComponent(String(months))}/${encodeURIComponent(periodGrouping)}/`,
    );
  }

  /** Get rolling PSC metrics (`/api/psc/{code}/metrics/{months}/{periodGrouping}/`). */
  async getPscMetrics(code: string, months: number | string, periodGrouping: string): Promise<AnyRecord> {
    if (!code) throw new TangoValidationError("PSC code is required");
    if (months === undefined || months === null) throw new TangoValidationError("months is required");
    if (!periodGrouping) throw new TangoValidationError("periodGrouping is required");
    return await this.http.get<AnyRecord>(
      `/api/psc/${encodeURIComponent(code)}/metrics/${encodeURIComponent(String(months))}/${encodeURIComponent(periodGrouping)}/`,
    );
  }

  // ---------------------------------------------------------------------------
  // Webhook alerts — list/get/update parity
  // ---------------------------------------------------------------------------

  /** List filter-based webhook subscriptions (alerts). */
  async listWebhookAlerts(options: { page?: number; pageSize?: number } = {}): Promise<PaginatedResponse<WebhookAlert>> {
    const params: AnyRecord = { page: options.page ?? 1 };
    if (options.pageSize !== undefined) params.page_size = options.pageSize;
    const data = await this.http.get<AnyRecord>("/api/webhooks/alerts/", params);
    return buildPaginatedResponse<WebhookAlert>(data);
  }

  /** Get a single filter-based webhook subscription by id. */
  async getWebhookAlert(id: string): Promise<WebhookAlert> {
    if (!id) throw new TangoValidationError("Webhook alert id is required");
    return await this.http.get<WebhookAlert>(`/api/webhooks/alerts/${encodeURIComponent(id)}/`);
  }

  /**
   * Patch a webhook alert (filter subscription).
   *
   * Only name, frequency, cron_expression, and is_active are writable.
   * query_type and filters are read-only after creation.
   */
  async updateWebhookAlert(
    id: string,
    input: {
      name?: string;
      frequency?: string;
      cronExpression?: string;
      isActive?: boolean;
    },
  ): Promise<WebhookAlert> {
    if (!id) throw new TangoValidationError("Webhook alert id is required");
    const body: AnyRecord = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.frequency !== undefined) body.frequency = input.frequency;
    if (input.cronExpression !== undefined) body.cron_expression = input.cronExpression;
    if (input.isActive !== undefined) body.is_active = input.isActive;
    return await this.http.patch<WebhookAlert>(`/api/webhooks/alerts/${encodeURIComponent(id)}/`, body);
  }

  // ---------------------------------------------------------------------------
  // Opportunity attachment search + misc
  // ---------------------------------------------------------------------------

  /**
   * Semantic search over opportunity attachments
   * (`/api/opportunities/attachment-search/`).
   */
  async searchOpportunityAttachments(options: SearchOpportunityAttachmentsOptions): Promise<AnyRecord> {
    if (!options || !options.q) {
      throw new TangoValidationError("searchOpportunityAttachments: 'q' is required");
    }
    const params: AnyRecord = { q: options.q };
    if (options.topK !== undefined) params.top_k = options.topK;
    if (options.includeExtractedText !== undefined) {
      params.include_extracted_text = options.includeExtractedText ? "true" : "false";
    }
    return await this.http.get<AnyRecord>("/api/opportunities/attachment-search/", params);
  }

  /** Get the Tango API version info (`/api/version/`). */
  async getVersion(): Promise<AnyRecord> {
    return await this.http.get<AnyRecord>("/api/version/");
  }

  /** List the authenticated user's API keys (`/api/api-keys/`). */
  async listApiKeys(): Promise<AnyRecord> {
    return await this.http.get<AnyRecord>("/api/api-keys/");
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
