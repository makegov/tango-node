import { TangoAPIError, TangoAuthError, TangoNotFoundError, TangoRateLimitError, TangoTimeoutError, TangoValidationError } from "../errors.js";
import { DEFAULT_BASE_URL } from "../config.js";
import type { RateLimitInfo } from "../types.js";
import { isRecord } from "./guards.js";

export interface HttpClientOptions {
  baseUrl?: string;
  apiKey?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Number of retry attempts on retryable failures. Default: 3. */
  retries?: number;
  /** Initial backoff in ms for exponential backoff. Default: 250. */
  retryBackoffMs?: number;
}

export interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

function isSafePrimitive(value: unknown): value is string | number | boolean | symbol | bigint {
  const type = typeof value;
  return type === "string" || type === "number" || type === "boolean" || type === "symbol" || type === "bigint";
}

function toParamValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  if (isSafePrimitive(value)) return String(value);
  return JSON.stringify(value);
}

function buildSearchParams(params?: Record<string, unknown>): string {
  if (!params) return "";
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        search.append(key, toParamValue(item));
      }
    } else {
      search.append(key, toParamValue(value));
    }
  }

  const queryString = search.toString();
  return queryString;
}

const MAX_BACKOFF_MS = 10_000;

/**
 * Sleep helper. Uses `setTimeout` and resolves on tick.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Parse a `Retry-After` header. Accepts both a delta-seconds form and an
 * HTTP-date form. Returns milliseconds, or `null` if header is missing/invalid.
 */
function parseRetryAfter(headers: Headers | undefined | null): number | null {
  if (!headers) return null;
  const raw = headers.get("retry-after") ?? headers.get("Retry-After");
  if (!raw) return null;

  // Numeric (delta seconds)
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum >= 0) {
    return Math.min(Math.floor(asNum * 1000), MAX_BACKOFF_MS);
  }

  // HTTP-date
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    if (delta > 0) return Math.min(delta, MAX_BACKOFF_MS);
    return 0;
  }

  return null;
}

/**
 * Decide whether a given status code is retryable.
 *
 * - 5xx: always retry
 * - 408 (Request Timeout) and 429 (Too Many Requests): retry
 * - other 4xx: do NOT retry
 */
function isRetryableStatus(status: number): boolean {
  if (status >= 500 && status < 600) return true;
  if (status === 408 || status === 429) return true;
  return false;
}

function parseInt10(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function getHeader(headers: Headers | Record<string, string> | null | undefined, name: string): string | null {
  if (!headers) return null;
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name);
  }
  const rec = headers as Record<string, string>;
  return rec[name] ?? rec[name.toLowerCase()] ?? null;
}

function parseRateLimit(headers: Headers | Record<string, string> | null | undefined): RateLimitInfo {
  return {
    remaining: parseInt10(getHeader(headers, "x-ratelimit-remaining")),
    limit: parseInt10(getHeader(headers, "x-ratelimit-limit")),
    resetIn: parseInt10(getHeader(headers, "x-ratelimit-reset")),
    retryAfter: parseInt10(getHeader(headers, "retry-after")),
    limitType: getHeader(headers, "x-ratelimit-type"),
  };
}

function headersToRecord(headers: Headers | Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (typeof (headers as Headers).forEach === "function") {
    (headers as Headers).forEach((value, key) => {
      out[key.toLowerCase()] = value;
    });
    return out;
  }
  for (const [k, v] of Object.entries(headers as Record<string, string>)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

export class HttpClient {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly timeoutMs: number;
  readonly retries: number;
  readonly retryBackoffMs: number;
  private readonly fetchImpl: typeof fetch;

  /** Snapshot of headers from the most recent response (null until a request completes). */
  lastResponseHeaders: Record<string, string> | null = null;
  /** Parsed rate-limit info from the most recent response. */
  rateLimitInfo: RateLimitInfo | null = null;

  constructor(options: HttpClientOptions = {}) {
    const {
      baseUrl = DEFAULT_BASE_URL,
      apiKey = null,
      timeoutMs = 30000,
      fetchImpl,
      retries = 3,
      retryBackoffMs = 250,
    } = options;

    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.retries = Math.max(0, retries);
    this.retryBackoffMs = Math.max(0, retryBackoffMs);

    const globalFetch: typeof fetch | undefined = typeof fetch !== "undefined" ? fetch : undefined;

    if (!fetchImpl && !globalFetch) {
      throw new Error("No fetch implementation available. Use Node 18+ (global fetch) or provide fetchImpl.");
    }

    this.fetchImpl = (fetchImpl ?? globalFetch)!;
  }

  /**
   * Execute a single HTTP attempt without retry/backoff logic.
   *
   * Returns either a parsed success body, or throws a Tango* error. When the
   * error is potentially retryable (5xx, 408, 429, or network failure), the
   * thrown error carries `__retryable = true` plus an optional `__retryAfterMs`
   * extracted from the response's `Retry-After` header.
   */
  private async attemptRequest<T>(options: RequestOptions): Promise<T> {
    const { method, path, query, body } = options;

    const url = new URL(path.replace(/^\//, ""), this.baseUrl.endsWith("/") ? `${this.baseUrl}` : `${this.baseUrl}/`);

    const queryString = buildSearchParams(query);
    if (queryString) {
      url.search = queryString;
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    let jsonBody: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      jsonBody = JSON.stringify(body);
    }

    if (this.apiKey) {
      headers["X-API-KEY"] = this.apiKey;
    }

    let controller: AbortController | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (typeof AbortController !== "undefined" && this.timeoutMs > 0) {
      controller = new AbortController();
      timeoutId = setTimeout(() => {
        controller?.abort();
      }, this.timeoutMs);
    }

    let res: Response;
    try {
      res = await this.fetchImpl(url.toString(), {
        method,
        headers,
        body: jsonBody,
        signal: controller?.signal,
      });
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);
      const name = (err as { name?: string } | null)?.name ?? null;
      if (name === "AbortError") {
        const timeoutErr = new TangoTimeoutError(`Request timed out after ${this.timeoutMs}ms`, 408, undefined);
        (timeoutErr as unknown as Record<string, unknown>).__retryable = true;
        throw timeoutErr;
      }
      const msg = err instanceof Error ? err.message : String(err);
      // Network-level errors (DNS, ECONNREFUSED, fetch network errors, ...) — retryable.
      const networkErr = new TangoAPIError(`Request failed: ${msg}`);
      (networkErr as unknown as Record<string, unknown>).__retryable = true;
      throw networkErr;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    // Snapshot response metadata for observability (rate_limit_info /
    // last_response_headers parity with the Python SDK).
    this.lastResponseHeaders = headersToRecord(res.headers);
    this.rateLimitInfo = parseRateLimit(res.headers);

    let text: string;
    let data: unknown = null;
    try {
      text = await res.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    const retryAfterMs = parseRetryAfter(res.headers);

    if (res.status === 401) {
      throw new TangoAuthError("Invalid API key or authentication required", res.status, data);
    }

    if (res.status === 404) {
      throw new TangoNotFoundError("Resource not found", res.status, data);
    }

    if (res.status === 400) {
      let msg = "Invalid request parameters";

      if (data && typeof data === "object") {
        const record = data as Record<string, unknown>;
        let detail = (record.detail as string | undefined) ?? (record.message as string | undefined) ?? (record.error as string | undefined) ?? null;

        if (!detail) {
          const keys = Object.keys(record);
          if (keys.length > 0) {
            const first = record[keys[0]];
            if (Array.isArray(first) && first.length > 0) {
              detail = String(first[0]);
            } else if (typeof first === "string") {
              detail = first;
            }
          }
        }

        if (detail) {
          msg = `Invalid request parameters: ${detail}`;
        }
      }

      throw new TangoValidationError(msg, res.status, data);
    }

    if (res.status === 429) {
      const e = new TangoRateLimitError("Rate limit exceeded", res.status, data);
      (e as unknown as Record<string, unknown>).__retryable = true;
      if (retryAfterMs !== null) {
        (e as unknown as Record<string, unknown>).__retryAfterMs = retryAfterMs;
      }
      throw e;
    }

    if (!res.ok) {
      const e = new TangoAPIError(`API request failed with status ${res.status}`, res.status, data);
      if (isRetryableStatus(res.status)) {
        (e as unknown as Record<string, unknown>).__retryable = true;
        if (retryAfterMs !== null) {
          (e as unknown as Record<string, unknown>).__retryAfterMs = retryAfterMs;
        }
      }
      throw e;
    }

    if (res.ok && isRecord(data) && typeof data.error === "string") {
      // The API occasionally signals errors in a 200 payload; surface as TangoAPIError.
      throw new TangoAPIError(data.error, res.status, data);
    }

    return (data ?? {}) as T;
  }

  async request<T = unknown>(options: RequestOptions): Promise<T> {
    let attempt = 0;
    // We do `retries` retries in addition to the first try, for a total of
    // `retries + 1` attempts.
    const maxAttempts = this.retries + 1;

     
    while (true) {
      try {
        return await this.attemptRequest<T>(options);
      } catch (err) {
        const meta = err as { __retryable?: boolean; __retryAfterMs?: number };
        const retryable = Boolean(meta && meta.__retryable);
        attempt += 1;

        if (!retryable || attempt >= maxAttempts) {
          throw err;
        }

        // Pick wait time: prefer server's Retry-After hint when present;
        // otherwise exponential backoff with the configured base, capped at 10s.
        let waitMs: number;
        if (typeof meta.__retryAfterMs === "number") {
          waitMs = meta.__retryAfterMs;
        } else {
          // attempt is 1-based after the first failure, so backoff doubles each retry.
          const exp = this.retryBackoffMs * Math.pow(2, attempt - 1);
          waitMs = Math.min(exp, MAX_BACKOFF_MS);
        }

        if (waitMs > 0) {
          await sleep(waitMs);
        }
      }
    }
  }

  get<T = unknown>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ method: "GET", path, query });
  }

  post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "POST", path, body });
  }

  patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "PATCH", path, body });
  }

  put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "PUT", path, body });
  }

  delete<T = unknown>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ method: "DELETE", path, query });
  }
}
