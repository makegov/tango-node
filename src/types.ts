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
   * Custom fetch implementation. If not provided, the global fetch will be used
   * (Node 18+ or browser environments).
   */
  fetchImpl?: typeof fetch;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  pageMetadata: Record<string, unknown> | null;
  results: T[];
}
