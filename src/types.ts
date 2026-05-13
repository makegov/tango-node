export interface TangoClientOptions {
  /**
   * Tango API key. If omitted, the client will try to read TANGO_API_KEY
   * from the environment (in Node environments).
   */
  apiKey?: string;

  /**
   * Base URL for the Tango API. Defaults to the public SaaS endpoint.
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds. Defaults to 30000ms (30 seconds).
   */
  timeoutMs?: number;

  /**
   * Ergonomic shorthand for `timeoutMs`. If both are supplied, `timeoutMs`
   * wins. Both accept milliseconds.
   */
  timeout?: number;

  /**
   * Custom fetch implementation. If not provided, the global fetch will be used
   * (Node 18+ or browser environments).
   */
  fetchImpl?: typeof fetch;

  /**
   * Number of retry attempts for retryable failures (5xx, 408, 429, network
   * errors). The first attempt is not counted as a retry. Default: `3`.
   * Set to `0` to disable retries entirely.
   */
  retries?: number;

  /**
   * Initial backoff for retries, in milliseconds. Exponential — doubles each
   * retry, capped at 10s. The server's `Retry-After` header, when present on
   * 429/503, overrides this. Default: `250`.
   */
  retryBackoffMs?: number;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  pageMetadata: Record<string, unknown> | null;
  /**
   * Cursor for keyset-paginated endpoints, extracted from `next`. Pass it back
   * via the next request's `cursor` option. `null` when the endpoint is
   * page-based or the cursor isn't present in `next`.
   */
  cursor: string | null;
  results: T[];
}

/**
 * Snapshot of rate-limit headers from the last response.
 * Mirrors Python's `RateLimitInfo` dataclass.
 */
export interface RateLimitInfo {
  /** Requests remaining in the current window (X-RateLimit-Remaining). */
  remaining: number | null;
  /** Window limit (X-RateLimit-Limit). */
  limit: number | null;
  /** Seconds until the window resets (X-RateLimit-Reset). */
  resetIn: number | null;
  /** Server's `Retry-After` header value, in seconds, when present. */
  retryAfter: number | null;
  /** Rate-limit tier label, if the server reports one (X-RateLimit-Type). */
  limitType: string | null;
}

/**
 * Typed return model for `client.resolve()`. Mirrors
 * `tango_python.models.ResolveResult` and `ResolveCandidate`.
 */
export interface ResolveCandidate {
  /** Canonical agency / org identifier resolved by Tango. */
  agency_id?: string | null;
  organization_id?: string | null;
  /** Display name of the candidate. */
  display_name?: string | null;
  /** Confidence score in [0, 1]. */
  score?: number | null;
  /** Match tier as reported by the API ("exact", "alias", "fuzzy", etc.). */
  match_tier?: string | null;
  [key: string]: unknown;
}

export interface ResolveResult {
  count: number;
  candidates: ResolveCandidate[];
  [key: string]: unknown;
}

/**
 * Typed return model for `client.validate()`. Mirrors
 * `tango_python.models.ValidateResult`.
 */
export interface ValidateResult {
  /** Validation verdict: "valid" | "invalid" | "low_confidence". */
  result: string;
  /** Identifier type that was validated. */
  type?: string;
  /** Identifier value submitted. */
  value?: string;
  /** Structured error list when `result` is non-valid. */
  errors?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/**
 * Typed return model for `client.getAgency()`. Permissive index signature for
 * forward-compatibility with new server-side fields.
 */
export interface AgencyRecord {
  agency_id?: string;
  name?: string;
  abbreviation?: string | null;
  code?: string | null;
  department?: Record<string, unknown> | null;
  [key: string]: unknown;
}

/**
 * Typed return model for `client.getProtest()`. Mirrors the canonical
 * GAO/COFC protest case schema.
 */
export interface ProtestRecord {
  case_id?: string;
  case_number?: string;
  source_system?: string;
  outcome?: string | null;
  case_type?: string | null;
  filed_date?: string | null;
  decision_date?: string | null;
  agency?: Record<string, unknown> | null;
  protester?: Record<string, unknown> | null;
  resolved_agency?: Record<string, unknown> | null;
  resolved_protester?: Record<string, unknown> | null;
  docket?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}
