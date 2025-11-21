import { DEFAULT_BASE_URL, ShapeConfig } from "./config.js";
import { TangoNotFoundError, TangoValidationError } from "./errors.js";
import { ModelFactory } from "./shapes/factory.js";
import { ShapeParser } from "./shapes/parser.js";
import type { ShapeSpec } from "./shapes/types.js";
import { HttpClient } from "./utils/http.js";
import { unflattenResponse } from "./utils/unflatten.js";
import { PaginatedResponse, TangoClientOptions } from "./types.js";

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

  private parseShape(shape: string | null | undefined, flat: boolean, flatLists: boolean): ShapeSpec | null {
    if (!shape) return null;
    return this.shapeParser.parseWithFlags(shape, flat, flatLists);
  }

  private materializeList(baseModel: string, shapeSpec: ShapeSpec | null, rawItems: AnyRecord[], flat: boolean): AnyRecord[] {
    const prepared = flat ? rawItems.map((item) => unflattenResponse(item)) : rawItems;
    if (!shapeSpec) return prepared;
    return this.modelFactory.createList(baseModel, shapeSpec, prepared);
  }

  private materializeOne(baseModel: string, shapeSpec: ShapeSpec | null, rawItem: AnyRecord, flat: boolean): AnyRecord {
    const prepared = flat ? unflattenResponse(rawItem) : rawItem;
    if (!shapeSpec) return prepared;
    return this.modelFactory.createOne(baseModel, shapeSpec, prepared);
  }
}
