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

## Organizations / Offices / Departments

### `listOrganizations(options?)`

```ts
const orgs = await client.listOrganizations({ search: "Defense", limit: 25 });
```

### `getOrganization(identifier)`

```ts
const org = await client.getOrganization("ORG_KEY");
```

### `listOffices(options?)`

```ts
const offices = await client.listOffices({ search: "acquisitions" });
```

### `getOffice(code)`

```ts
const office = await client.getOffice("4732XX");
```

### `listDepartments(options?)`

> **Deprecated.** Use `listOrganizations({ level: 1 })` instead. The standalone departments endpoint is retained for backward compatibility and will be removed in a future API version.

```ts
const depts = await client.listDepartments({ page: 1, limit: 25 });
```

### `getDepartment(code)`

```ts
const dept = await client.getDepartment("097");
```

---

## OTAs

Other Transaction Agreements — non-FAR-based awards.

### `listOtas(options?)`

Uses **keyset pagination** (`cursor` + `limit`).

```ts
const otas = await client.listOtas({ limit: 25, awarding_agency: "4700" });
```

### `getOta(key)`

```ts
const ota = await client.getOta("OTA_KEY");
```

---

## OTIDVs

Other Transaction IDVs — umbrella OT agreements with child awards.

### `listOtidvs(options?)`

Uses **keyset pagination** (`cursor` + `limit`).

```ts
const otidvs = await client.listOtidvs({ limit: 25 });
```

### `getOtidv(key)`

```ts
const otidv = await client.getOtidv("OTIDV_KEY");
```

### `listOtidvAwards(key, options?)`

```ts
const awards = await client.listOtidvAwards("OTIDV_KEY", { limit: 25 });
```

---

## Subawards

### `listSubawards(options?)`

```ts
const subs = await client.listSubawards({ prime_uei: "ABC123DEF456", limit: 25 });
```

---

## GSA eLibrary Contracts

### `listGsaElibraryContracts(options?)`

```ts
const contracts = await client.listGsaElibraryContracts({ schedule: "MAS", limit: 25 });
```

---

## Protests

### `listProtests(options?)`

```ts
const protests = await client.listProtests({ source_system: "gao", limit: 25 });
```

### `getProtest(caseNumber)`

```ts
const protest = await client.getProtest("CASE_UUID");
```

---

## IT Dashboard

### `listItDashboard(options?)`

```ts
const investments = await client.listItDashboard({ search: "cloud", limit: 25 });
```

### `getItDashboard(uii)`

```ts
const investment = await client.getItDashboard("023-000001234");
```

---

## LCATs

### `listLcats(options)`

Requires either `{ uei }` (entity LCATs) or `{ idvKey }` (IDV LCATs) — throws `TangoValidationError` if neither is provided.

```ts
const lcats = await client.listLcats({ uei: "ABCDEF123456" });
// or:
const lcats = await client.listLcats({ idvKey: "GS-00F-XXXX" });
```

### `listIdvLcats(key, options?)`

```ts
const lcats = await client.listIdvLcats("GS-00F-XXXX", { limit: 25 });
```

---

## Metrics

### `listMetrics(options)`

List metrics for a NAICS code, PSC code, or entity. `ownerType`, `ownerId`, `months`, and `periodGrouping` are all required.

```ts
const metrics = await client.listMetrics({
  ownerType: "naics",
  ownerId: "541511",
  months: 12,
  periodGrouping: "month",
});
```

### `getNaicsMetrics(code, months, periodGrouping)`

```ts
const m = await client.getNaicsMetrics("541511", 12, "month");
```

### `getPscMetrics(code, months, periodGrouping)`

```ts
const m = await client.getPscMetrics("D302", 12, "month");
```

### `getEntityMetrics(uei, months, periodGrouping)`

```ts
const m = await client.getEntityMetrics("ABCDEF123456", 12, "month");
```

---

## Reference Lookups

### `listNaics(options?)` / `getNaics(code)`

```ts
const naics = await client.listNaics({ search: "software" });
const code = await client.getNaics("541511");
```

### `listPsc(options?)` / `getPsc(code)`

```ts
const psc = await client.listPsc();
const code = await client.getPsc("D302");
```

### `listMasSins(options?)` / `getMasSin(sin)`

```ts
const sins = await client.listMasSins();
const sin = await client.getMasSin("54151S");
```

### `listAssistanceListings(options?)` / `getAssistanceListing(number)`

```ts
const listings = await client.listAssistanceListings();
const listing = await client.getAssistanceListing("10.310");
```

### `listBusinessTypes(options?)` / `getBusinessType(code)`

```ts
const types = await client.listBusinessTypes();
const bt = await client.getBusinessType("A6");
```

---

## Resolve / Validate

### `resolve(input)`

Resolve a free-text name to ranked entity or organization candidates.

```ts
const result = await client.resolve({ name: "Lockheed Martin", target_type: "entity" });
// result.candidates[0].display_name, result.count
```

Required fields: `name`, `target_type` (`"entity"` | `"organization"`).

### `validate(input)`

Validate the format of a PIID, solicitation number, or UEI.

```ts
const result = await client.validate({ type: "uei", value: "ABCDEF123456" });
```

Required fields: `type` (`"piid"` | `"solicitation"` | `"uei"`), `value`.

---

## Entity Sub-resources

### `listEntityContracts(uei, options?)`

```ts
const contracts = await client.listEntityContracts("ABCDEF123456", { limit: 25 });
```

### `listEntityIdvs(uei, options?)` / `listEntityOtas(uei, options?)` / `listEntityOtidvs(uei, options?)`

```ts
const idvs = await client.listEntityIdvs("ABCDEF123456");
```

### `listEntitySubawards(uei, options?)` / `listEntityLcats(uei, options?)`

```ts
const subawards = await client.listEntitySubawards("ABCDEF123456");
```

---

## Agency Sub-resources

### `listAgencyAwardingContracts(code, options?)`

```ts
const contracts = await client.listAgencyAwardingContracts("4700", { limit: 25 });
```

### `listAgencyFundingContracts(code, options?)`

```ts
const contracts = await client.listAgencyFundingContracts("4700", { limit: 25 });
```

---

## Opportunities (attachments)

### `searchOpportunityAttachments(options)`

Semantic search over opportunity attachments. `q` is required.

```ts
const results = await client.searchOpportunityAttachments({
  q: "cybersecurity",
  topK: 10, // max results (optional)
  includeExtractedText: false, // include raw extracted text (optional)
});
```

| Name                   | Type      | Description                            |
| ---------------------- | --------- | -------------------------------------- |
| `q`                    | `string`  | **Required.** Search query.            |
| `topK`                 | `number`  | Maximum number of results to return.   |
| `includeExtractedText` | `boolean` | Whether to include raw extracted text. |

---

## Async Iteration

All list methods can be iterated page-by-page via the generic `iterate()` helper or the named convenience wrappers.

### `iterate(method, options?)`

```ts
for await (const contract of client.iterate("listContracts", { awarding_agency: "9700" })) {
  console.log(contract.piid);
}
```

Named wrappers: `iterateContracts`, `iterateEntities`, `iterateOpportunities`, `iterateNotices`, `iterateGrants`, `iterateForecasts`, `iterateIdvs`, `iterateVehicles`.

---

## Utility

### `getVersion()`

```ts
const v = await client.getVersion();
```

### `listApiKeys()`

```ts
const keys = await client.listApiKeys();
```

---

## Webhooks (v2)

Webhook APIs let **Large / Enterprise** users manage subscription filters for outbound Tango webhooks.

### `listWebhookEventTypes()`

Discover supported `event_type` values.

```ts
const info = await client.listWebhookEventTypes();
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

### `testWebhookEndpoint(endpointId)`

Send an immediate test webhook to a specific endpoint. `endpointId` is required.

```ts
const result = await client.testWebhookEndpoint("ENDPOINT_UUID");
```

### `testWebhookDelivery(options?)` _(legacy alias)_

Legacy wrapper around `testWebhookEndpoint`. `endpointId` may be omitted, in which case the API auto-resolves the user's only endpoint (404 if 0, 400 if >1). Prefer `testWebhookEndpoint` for new code.

```ts
const result = await client.testWebhookDelivery({ endpointId: "ENDPOINT_UUID" });
```

### `getWebhookSamplePayload(options?)`

Fetch Tango-shaped sample deliveries (and sample subscription request bodies).

```ts
const sample = await client.getWebhookSamplePayload({ eventType: "alerts.contract.match" });
```

### Webhook Alerts

The Alerts API is a filter-subscription convenience layer on top of subscriptions.

```ts
// Create
const alert = await client.createWebhookAlert({
  name: "New IT cloud contracts",
  query_type: "contract",
  filters: { naics: "541511" },
});

// List
const alerts = await client.listWebhookAlerts({ page: 1, pageSize: 25 });

// Get / Update / Delete
const alert = await client.getWebhookAlert("ALERT_UUID");
await client.updateWebhookAlert("ALERT_UUID", { name: "Updated name" });
await client.deleteWebhookAlert("ALERT_UUID");
```

Notes:

- `name` and `query_type` are required on create. `query_type` is **singular** (e.g. `"contract"`, not `"contracts"`).

### Deliveries / redelivery

The API does not currently expose a public `/api/webhooks/deliveries/` or redelivery endpoint. Use:

- `testWebhookEndpoint(endpointId)` for connectivity checks
- `getWebhookSamplePayload()` for building handlers + alert payloads

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
