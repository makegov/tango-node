# Client Configuration

`TangoClient` is the entry point for every API call. This guide covers the constructor, environment variables, retry semantics, error handling, and how to plug in a custom `fetch`.

For per-method signatures, see [`API_REFERENCE.md`](API_REFERENCE.md). For webhook receivers, see [`WEBHOOKS.md`](WEBHOOKS.md). For response shaping, see [`SHAPES.md`](SHAPES.md).

## Constructor

```typescript
import { TangoClient } from "@makegov/tango-node";

const client = new TangoClient({
  apiKey: process.env.TANGO_API_KEY,   // optional if TANGO_API_KEY is set in env
  baseUrl: "https://tango.makegov.com", // default
  timeoutMs: 30_000,                    // default
  retries: 3,                           // default
  retryBackoffMs: 250,                  // default
});
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `apiKey` | `string` | reads `TANGO_API_KEY` env | Tango API key. Sent as `X-API-KEY` header. |
| `baseUrl` | `string` | `https://tango.makegov.com` | API base URL. Override for staging/local. |
| `timeoutMs` | `number` | `30000` | Per-request timeout in milliseconds. Aborts with `TangoTimeoutError`. |
| `timeout` | `number` | — | Ergonomic shorthand for `timeoutMs` (also in ms). If both are supplied, `timeoutMs` wins. |
| `retries` | `number` | `3` | Number of retry attempts on retryable failures. Set to `0` to disable. Total attempts = `retries + 1`. |
| `retryBackoffMs` | `number` | `250` | Initial backoff between retries (ms). Doubles each retry, capped at 10s. |
| `fetchImpl` | `typeof fetch` | global `fetch` | Custom fetch implementation. Useful for proxies, instrumentation, or runtimes without a global fetch. |

### Environment variables

| Env var | Purpose |
| --- | --- |
| `TANGO_API_KEY` | Default API key when `apiKey` is not passed to the constructor. |
| `TANGO_BASE_URL` | Default base URL when `baseUrl` is not passed. Falls through to `https://tango.makegov.com` if neither is set. |

## Retry semantics

The client retries failed requests automatically. A request is retried when:

- The HTTP status is `5xx` (any server error),
- The status is `408` (Request Timeout) or `429` (Too Many Requests),
- Or the request fails at the network layer (DNS, connection refused, fetch network error, abort due to client-side timeout).

Other `4xx` statuses (`400`, `401`, `403`, `404`, …) are **not** retried — they're surfaced as the appropriate `Tango*` error immediately.

### Backoff math

- First retry: `retryBackoffMs` (default 250ms)
- Second retry: `retryBackoffMs * 2`
- Third retry: `retryBackoffMs * 4`
- Each wait is capped at **10 seconds**.

If the response includes a `Retry-After` header (typical on `429` and `503`), the client honors that value instead of computing its own backoff:

- A delta-seconds value (`Retry-After: 5`) → waits 5 seconds.
- An HTTP-date value (`Retry-After: Wed, 21 Oct 2026 07:28:00 GMT`) → waits until that time.
- The honored wait is still capped at 10 seconds.

To disable retries entirely (e.g. for smoke tests or one-shot scripts where you'd rather see the raw failure):

```typescript
const client = new TangoClient({
  apiKey: process.env.TANGO_API_KEY,
  retries: 0,
});
```

## Error handling

All Tango errors extend `TangoAPIError`. Import them from the package root:

```typescript
import {
  TangoClient,
  TangoAPIError,
  TangoAuthError,
  TangoNotFoundError,
  TangoValidationError,
  TangoRateLimitError,
  TangoTimeoutError,
} from "@makegov/tango-node";

const client = new TangoClient({ apiKey: process.env.TANGO_API_KEY });

try {
  const entity = await client.getEntity("ABCDEF123456");
  console.log(entity);
} catch (err) {
  if (err instanceof TangoNotFoundError) {
    console.warn("No such entity");
  } else if (err instanceof TangoValidationError) {
    console.error("Bad request:", err.message, err.responseData);
  } else if (err instanceof TangoAuthError) {
    console.error("Check your API key");
  } else if (err instanceof TangoRateLimitError) {
    // The client already retried `retries` times before giving up.
    console.error("Rate limited; back off harder");
  } else if (err instanceof TangoTimeoutError) {
    console.error("Request timed out; consider raising timeoutMs");
  } else if (err instanceof TangoAPIError) {
    console.error("API error:", err.statusCode, err.message);
  } else {
    throw err;
  }
}
```

Every `TangoAPIError` carries:

- `message: string` — human-readable; for 400s, the SDK extracts the first `detail` / `message` / `error` / field-error from the response body when present.
- `statusCode?: number` — HTTP status (or `408` for client-side timeouts).
- `responseData?: unknown` — parsed JSON body of the error response (when the server returned JSON).

The client also throws `TangoAPIError` when an HTTP 200 response body contains `{ "error": "..." }` — the Tango API occasionally signals errors in 200 payloads.

## Custom `fetch`

Pass a custom `fetchImpl` to instrument requests, route through a proxy, or run in a non-Node runtime:

```typescript
import { TangoClient } from "@makegov/tango-node";

const tracedFetch: typeof fetch = async (input, init) => {
  const start = Date.now();
  const res = await fetch(input, init);
  console.log(`${init?.method ?? "GET"} ${input} → ${res.status} (${Date.now() - start}ms)`);
  return res;
};

const client = new TangoClient({
  apiKey: process.env.TANGO_API_KEY,
  fetchImpl: tracedFetch,
});
```

## Targeting staging or local

Point `baseUrl` at the host you want:

```typescript
const client = new TangoClient({
  apiKey: process.env.TANGO_API_KEY,
  baseUrl: "http://localhost:8000",
});
```

The trailing slash on `baseUrl` is optional; the client normalizes it.
