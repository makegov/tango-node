# Tango Node SDK – API Reference

This document provides the full API reference for the **Node.js / TypeScript**
version of the Tango SDK. It is a translation of the Python SDK documentation,
rewritten for JavaScript runtime semantics, async/await, and the TypeScript
type system.

## Importing

```ts
import { TangoClient, ShapeConfig } from "@makegov/tango-node";
// Models (optional)
import type { Contract } from "@makegov/tango-node/models";
```

All methods are async and return Promises.

---

## Agencies

### `listAgencies(options?)`

List federal departments and subagencies.

```ts
const resp = await client.listAgencies({ page: 1, limit: 25 });
```

#### Parameters

| Name    | Type     | Description                                 |
| ------- | -------- | ------------------------------------------- |
| `page`  | `number` | Page number (default 1).                    |
| `limit` | `number` | Max results per page (default 25, max 100). |

#### Returns (Agencies)

`PaginatedResponse<AgencyLike>`

---

### `getAgency(code)`

Fetch a single agency by its code.

```ts
const agency = await client.getAgency("2000");
```

Returns a shaped Agency object. Responses are materialized via the dynamic model pipeline (dates parsed, nested objects built).

---

## Business Types

### `listBusinessTypes(options?)`

Lists SBA/USASpending business type entries.

```ts
const types = await client.listBusinessTypes();
```

---

## Contracts

### `listContracts(options)`

Search and list contract records.

```ts
const resp = await client.listContracts({
  keyword: "cloud",
  naics_code: "541511",
  shape: ShapeConfig.CONTRACTS_MINIMAL,
  flat: true,
});
```

#### Search / Filter Parameters

These mirror the Python SDK:

| Filter           | Maps to API param |
| ---------------- | ----------------- |
| `keyword`        | `search`          |
| `naics_code`     | `naics`           |
| `psc_code`       | `psc`             |
| `recipient_name` | `recipient`       |
| `recipient_uei`  | `uei`             |
| `set_aside_type` | `set_aside`       |

Sorting:

```ts
sort: "award_date",
order: "desc"   // -> ordering="-award_date"
```

Pagination + shaping options:

```ts
shape: string,
flat: boolean,
flatLists: boolean,
page: number,
limit: number
```

#### Returns (Contracts)

`PaginatedResponse<Contract>` materialized according to the requested shape. Date/datetime fields are parsed, decimals normalized to strings, nested recipients, agencies, and locations are objects.

---

## Vehicles

Vehicles provide a solicitation-centric grouping of related IDVs.

### `listVehicles(options)`

```ts
const resp = await client.listVehicles({
  search: "GSA schedule",
  shape: ShapeConfig.VEHICLES_MINIMAL,
  page: 1,
  limit: 25,
});
```

Supported parameters:

- `search` (vehicle-level full-text search)
- `page`, `limit` (max 100)
- `shape`, `flat`, `flatLists`

### `getVehicle(uuid, options?)`

```ts
const vehicle = await client.getVehicle("00000000-0000-0000-0000-000000000001", {
  shape: ShapeConfig.VEHICLES_COMPREHENSIVE,
});
```

Notes:

- On vehicle detail, `search` filters expanded `awardees(...)` when included in your `shape` (it does not filter the vehicle itself).
- When using `flat: true`, you can override the joiner with `joiner` (default `"."`).

### `listVehicleAwardees(uuid, options?)`

```ts
const awardees = await client.listVehicleAwardees("00000000-0000-0000-0000-000000000001", {
  shape: ShapeConfig.VEHICLE_AWARDEES_MINIMAL,
});
```

---

## IDVs

IDVs (indefinite delivery vehicles) are the parent “vehicle award” records that can have child awards/orders under them.

### `listIdvs(options)`

```ts
const idvs = await client.listIdvs({
  limit: 25,
  cursor: null,
  shape: ShapeConfig.IDVS_MINIMAL,
  awarding_agency: "4700",
});
```

Notes:

- This endpoint uses **keyset pagination** (`cursor` + `limit`) rather than `page`.

### `getIdv(key, options?)`

```ts
const idv = await client.getIdv("SOME_IDV_KEY", {
  shape: ShapeConfig.IDVS_COMPREHENSIVE,
});
```

### `listIdvAwards(key, options?)`

Lists child awards (contracts) under an IDV.

```ts
const awards = await client.listIdvAwards("SOME_IDV_KEY", { limit: 25 });
```

### `listIdvChildIdvs({ key, ...options })`

```ts
const children = await client.listIdvChildIdvs({ key: "SOME_IDV_KEY", limit: 25 });
```

### `listIdvTransactions(key, options?)`

```ts
const tx = await client.listIdvTransactions("SOME_IDV_KEY", { limit: 100 });
```

### `getIdvSummary(identifier)` / `listIdvSummaryAwards(identifier, options?)`

```ts
const summary = await client.getIdvSummary("SOLICITATION_IDENTIFIER");
const awards = await client.listIdvSummaryAwards("SOLICITATION_IDENTIFIER", { limit: 25 });
```

---

## Entities

### `listEntities(options)`

```ts
const resp = await client.listEntities({
  search: "Acme",
  shape: ShapeConfig.ENTITIES_MINIMAL,
});
```

Filters:

- `search`
- any field names supported by the API

### `getEntity(uei, options?)`

Fetch a single entity by UEI or CAGE.

Returns a shaped entity object with nested addresses/fields based on the shape.

---

## Forecasts

### `listForecasts(options)`

Forecast search, with optional shaping.

---

## Opportunities

### `listOpportunities(options)`

Search SAM.gov opportunities with shaping.

---

## Notices

### `listNotices(options)`

---

## Grants

### `listGrants(options)`

---

## Webhooks (v2)

Webhook APIs let **Large / Enterprise** users manage subscription filters for outbound Tango webhooks.

### `listWebhookEventTypes()`

Discover supported `event_type` values and subject types.

```ts
const info = await client.listWebhookEventTypes();
```

### `listWebhookSubscriptions(options?)`

```ts
const subs = await client.listWebhookSubscriptions({ page: 1, pageSize: 25 });
```

Notes:

- Uses `page` + `page_size` (not `limit`) for pagination on this endpoint.

### `getWebhookSubscription(id)`

```ts
const sub = await client.getWebhookSubscription("SUBSCRIPTION_UUID");
```

### `createWebhookSubscription({ subscriptionName, payload })`

```ts
await client.createWebhookSubscription({
  subscriptionName: "Track specific vendors",
  payload: {
    records: [
      { event_type: "awards.new_award", subject_type: "entity", subject_ids: ["UEI123ABC"] },
      { event_type: "awards.new_transaction", subject_type: "entity", subject_ids: ["UEI123ABC"] },
    ],
  },
});
```

Notes:

- Prefer v2 fields: `subject_type` + `subject_ids`.
- Legacy compatibility: `resource_ids` is accepted as an alias for `subject_ids` (don’t send both).
- Catch-all: `subject_ids: []` means “all subjects” for that record and is **Enterprise-only**. Large tier users must list specific IDs.

### `updateWebhookSubscription(id, patch)`

```ts
await client.updateWebhookSubscription("SUBSCRIPTION_UUID", {
  subscriptionName: "Updated name",
});
```

### `deleteWebhookSubscription(id)`

```ts
await client.deleteWebhookSubscription("SUBSCRIPTION_UUID");
```

### Webhook endpoints

In production, MakeGov provisions the initial endpoint for you. These methods are most useful for dev/self-service.

```ts
const endpoints = await client.listWebhookEndpoints({ page: 1, limit: 25 });
const endpoint = await client.getWebhookEndpoint("ENDPOINT_UUID");
```

```ts
// Create (one endpoint per user)
const created = await client.createWebhookEndpoint({ callbackUrl: "https://example.com/tango/webhooks" });

// Update
await client.updateWebhookEndpoint(created.id, { isActive: false });

// Delete
await client.deleteWebhookEndpoint(created.id);
```

### `testWebhookDelivery(options?)`

Send an immediate test webhook to your configured endpoint.

```ts
const result = await client.testWebhookDelivery();
```

### `getWebhookSamplePayload(options?)`

Fetch Tango-shaped sample deliveries (and sample subscription request bodies).

```ts
const sample = await client.getWebhookSamplePayload({ eventType: "awards.new_award" });
```

### Deliveries / redelivery

The API does not currently expose a public `/api/webhooks/deliveries/` or redelivery endpoint. Use:

- `testWebhookDelivery()` for connectivity checks
- `getWebhookSamplePayload()` for building handlers + subscription payloads

### Receiving webhooks (signature verification)

Every delivery includes an HMAC signature header:

- `X-Tango-Signature: sha256=<hex digest>`

Compute the digest over the **raw request body bytes** using your shared secret.

```ts
import crypto from "node:crypto";

export function verifyTangoWebhookSignature(secret: string, rawBody: Buffer, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const sig = signatureHeader.startsWith("sha256=") ? signatureHeader.slice("sha256=".length) : signatureHeader;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
}
```

---

## Error Types

All thrown by async methods:

- `TangoAPIError`
- `TangoAuthError`
- `TangoNotFoundError`
- `TangoRateLimitError`
- `TangoValidationError`
- `ShapeError`
- `ShapeParseError`
- `ShapeValidationError`
- `TypeGenerationError`
- `ModelInstantiationError`

---

## Pagination

All list endpoints return:

```ts
interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  pageMetadata: Record<string, unknown> | null;
  results: T[];
}
```

You can follow `next` / `previous` manually or use your own wrapper.
