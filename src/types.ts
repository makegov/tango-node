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
  results: T[];
}
