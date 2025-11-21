import {
  TangoAPIError,
  TangoAuthError,
  TangoNotFoundError,
  TangoRateLimitError,
  TangoValidationError,
} from "../errors.js";
import { DEFAULT_BASE_URL } from "../config.js";

export interface HttpClientOptions {
  baseUrl?: string;
  apiKey?: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface RequestOptions {
  method: "GET" | "POST";
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
}

function buildSearchParams(params?: Record<string, unknown>): string {
  if (!params) return "";
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        search.append(key, String(item));
      }
    } else {
      search.append(key, String(value));
    }
  }

  const queryString = search.toString();
  return queryString;
}

export class HttpClient {
  readonly baseUrl: string;
  readonly apiKey: string | null;
  readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpClientOptions = {}) {
    const { baseUrl = DEFAULT_BASE_URL, apiKey = null, timeoutMs = 30000, fetchImpl } = options;

    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;

    const globalFetch = (typeof fetch !== "undefined" ? fetch : undefined) as
      | typeof fetch
      | undefined;

    if (!fetchImpl && !globalFetch) {
      throw new Error(
        "No fetch implementation available. Use Node 18+ (global fetch) or provide fetchImpl.",
      );
    }

    this.fetchImpl = (fetchImpl ?? globalFetch)!;
  }

  async request<T = unknown>(options: RequestOptions): Promise<T> {
    const { method, path, query, body } = options;

    const url = new URL(
      path.replace(/^\//, ""),
      this.baseUrl.endsWith("/") ? `${this.baseUrl}` : `${this.baseUrl}/`,
    );

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
      const msg = err instanceof Error ? err.message : String(err);
      throw new TangoAPIError(`Request failed: ${msg}`);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    let text: string;
    let data: unknown = null;
    try {
      text = await res.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

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
        let detail =
          (record.detail as string | undefined) ??
          (record.message as string | undefined) ??
          (record.error as string | undefined) ??
          null;

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
      throw new TangoRateLimitError("Rate limit exceeded", res.status, data);
    }

    if (!res.ok) {
      throw new TangoAPIError(
        `API request failed with status ${res.status}`,
        res.status,
        data,
      );
    }

    return (data ?? {}) as T;
  }

  get<T = unknown>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ method: "GET", path, query });
  }

  post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>({ method: "POST", path, body });
  }
}
