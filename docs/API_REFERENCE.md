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

`key` is also a typed filter — pass a contract key (or several separated by `|`) to fetch specific records through the list endpoint.
The same `key` filter exists on `listIdvs`, `listOtas`, and `listOtidvs`.

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
limit: number,
cursor: string,  // mutually exclusive with `page` — if provided, `page` is ignored
```

Contracts support both **page-based** and **cursor-based** pagination. Use `cursor` for deep pagination (faster and more stable on large result sets); use `page` for small offsets or when you need to jump to a specific page. `page` and `cursor` are mutually exclusive — if you pass `cursor`, the SDK ignores `page`.

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
- `cage` (CAGE code, typed alongside the existing `cage_code`)
- any field names supported by the API

### `getEntity(uei, options?)`

Fetch a single entity by UEI or CAGE.

Returns a shaped entity object with nested addresses/fields based on the shape.

---

## Forecasts

### `listForecasts(options)`

Forecast search, with optional shaping.
`id` is a typed filter for fetching specific forecast records through the list endpoint.

---

## Opportunities

### `listOpportunities(options)`

Search SAM.gov opportunities with shaping.
`opportunity_id` is a typed filter for fetching specific opportunities through the list endpoint.

---

## Notices

### `listNotices(options)`

---

## Grants

### `listGrants(options)`

---

## Organizations / Offices / Departments

### `listOrganizations(options?)`

The canonical agency/department/office hierarchy. `level` filters by hierarchy depth: `1` = department, `2` = agency, `3` = sub-agency, and so on.

```ts
const orgs = await client.listOrganizations({
  level: 1,                // 1 = department, 2 = agency, 3 = sub-agency, …
  include_inactive: false,
  search: "Defense",
  limit: 25,
});
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

### `getGsaElibraryContract(uuid, options?)`

Fetch a single GSA eLibrary contract by UUID, with the standard `shape` / `flat` / `flatLists` / `joiner` options.
Defaults to `ShapeConfig.GSA_ELIBRARY_CONTRACTS_MINIMAL` when no shape is passed.

```ts
const contract = await client.getGsaElibraryContract("00000000-0000-0000-0000-000000000001", {
  shape: ShapeConfig.GSA_ELIBRARY_CONTRACTS_MINIMAL,
});
```

---

## Protests

### `listProtests(options?)`

```ts
const protests = await client.listProtests({ source_system: "gao", limit: 25 });
```

`naics_code` is a typed filter sent to the API verbatim (it is **not** remapped to `naics`, unlike the contracts alias).

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

`listItDashboard` also accepts `previous_uii` as a typed filter, for tracing an investment across UII renumbering.

---

## Budget Accounts

OMB budget appendix accounts with lifecycle amounts (requested → enacted → apportioned → obligated → outlayed), derived ratios, and trends.

### `listBudgetAccounts(options?)`

```ts
const accounts = await client.listBudgetAccounts({
  fiscal_year: 2025,
  agency_code: "097",
  unobligated_balance__gte: 1_000_000_000,
  ordering: "-unobligated_balance",
});
```

`ListBudgetAccountsOptions` types the **full** filter surface of `/api/budget/accounts/` — every numeric lifecycle, ratio, and trend field exposes an exact / `__gte` / `__lte` triplet, and categorical filters carry `__in` / `__icontains` variants.
The range filters use the API's **dunder wire names** (double underscore, e.g. `fiscal_year__gte`) — these are passed through verbatim.
A representative sample:

| Filter family | Example params |
| ------------- | -------------- |
| Identity / categorical | `federal_account_symbol`, `fiscal_year`, `agency_code__in`, `bureau_name__icontains`, `bea_category`, `subfunction_code`, `account_title__icontains` |
| Lifecycle amounts | `requested_ba__gte`, `enacted_ba__lte`, `apportioned__gte`, `obligated_total__gte`, `outlayed_total__lte`, `unobligated_balance__gte` |
| Contract / assistance breakdowns | `contract_obligated__gte`, `assistance_outlayed__lte`, `contract_share_of_obligated_capped__gte` |
| Ratios | `obligated_to_apportioned_pct__gte`, `apportioned_to_enacted_pct_capped__lte`, `outlayed_to_obligated_pct__gte`, `unobligated_pct__gte` |
| Trends | `enacted_ba_yoy_pct__gte`, `obligated_yoy_pct__lte`, `enacted_ba_5yr_cagr__gte`, `ba_growth_next_year_pct__gte`, `actual_vs_requested_contract__gte` |

See `ListBudgetAccountsOptions` in `src/client.ts` for the complete list — every filter is a typed, autocompleted option.
Any of the numeric fields is a valid `ordering` target (`ordering: "-unobligated_balance"` ranks by largest headroom first), and `search` covers account title, agency name, and bureau name.

**Legacy aliases.** Three pre-1.2 option names are kept and remapped to the params the API actually understands: `fiscal_year_gte` → `fiscal_year__gte`, `fiscal_year_lte` → `fiscal_year__lte`, and `account_title` → `account_title__icontains`.
An explicitly passed dunder param wins over its alias.

### `getBudgetAccount(id, options?)`

```ts
const account = await client.getBudgetAccount("ACCOUNT_ID");
```

### `getBudgetAccountQuarters(id, options?)` / `getBudgetAccountRecipients(id, options?)`

Quarterly lifecycle history and top recipients for one account.

```ts
const quarters = await client.getBudgetAccountQuarters("ACCOUNT_ID");
const recipients = await client.getBudgetAccountRecipients("ACCOUNT_ID");
```

---

## DIBBS

DLA DIBBS solicitations and awards: RFQs, RFPs, and award history.

### `listDibbsRfqs(options?)` / `getDibbsRfq(uuid, options?)`

```ts
const rfqs = await client.listDibbsRfqs({
  nsn: "5310-01-234-5678",
  open: true,
  shape: ShapeConfig.DIBBS_RFQS_MINIMAL,
});
```

Typed filters: `nsn`, `part_number`, `solicitation`, `purchase_request`, `organization`, `status_code`, `set_aside`, `open`, `quantity_min` / `quantity_max`, `issue_date_after` / `issue_date_before`, `return_by_date_after` / `return_by_date_before`, `search`, `ordering`.

### `listDibbsRfps(options?)` / `getDibbsRfp(uuid, options?)`

```ts
const rfps = await client.listDibbsRfps({ open: true, limit: 25 });
```

Typed filters: `nsn`, `part_number`, `solicitation`, `organization`, `buyer_code`, `open`, `issued_date_after` / `issued_date_before`, `closes_date_after` / `closes_date_before`, `search`, `ordering`.

### `listDibbsAwards(options?)` / `getDibbsAward(uuid, options?)`

```ts
const awards = await client.listDibbsAwards({ awardee_cage: "1ABC2", limit: 25 });
```

Typed filters: `award_number`, `delivery_order_number`, `solicitation`, `purchase_request`, `nsn`, `part_number`, `awardee_cage`, `entity`, `organization`, `total_contract_price_min` / `total_contract_price_max`, `award_date_after` / `award_date_before`, `posted_date_after` / `posted_date_before`, `search`, `ordering`.

Two API behaviors worth knowing:

- `is_open` is **derived at query time** from `return_by_date` (RFQs) / `closes_date` (RFPs) — filter with the `open` option rather than shaping on `is_open`.
- DIBBS `total_contract_price` is the **order** total repeated on every line item — never sum it across rows; deduplicate on award + delivery-order number first.

---

## Exclusions

SAM.gov exclusion records (debarments, suspensions, and other ineligibility actions).

### `listExclusions(options?)` / `getExclusion(exclusionKey, options?)`

```ts
const exclusions = await client.listExclusions({
  active: true,
  classification_type: "Firm",
  shape: ShapeConfig.EXCLUSIONS_MINIMAL,
});
```

Typed filters: `uei`, `entity_uei`, `cage_code`, `npi`, `classification_type`, `exclusion_type`, `exclusion_program`, `excluding_agency_code`, `excluding_agency_name`, `active`, `delisted`, `activate_date_after` / `activate_date_before`, `termination_date_after` / `termination_date_before`, `update_date_after` / `update_date_before`, `search`, `ordering`.

`is_currently_excluded` is **derived at query time** — filter with `active: true` for records currently in effect rather than shaping on it.

---

## SBIR / STTR

SBIR/STTR topics and DoD DSIP solicitation cycles.

### `listSbirTopics(options?)` / `getSbirTopic(topicId, options?)`

```ts
const topics = await client.listSbirTopics({
  agency: "DOD",
  year: 2026,
  shape: ShapeConfig.SBIR_TOPICS_MINIMAL,
});
```

Typed filters: `topic_number`, `solicitation_number`, `agency`, `activity`, `year`, `doc_source`, `open_date_after` / `open_date_before`, `close_date_after` / `close_date_before`, `release_date_after` / `release_date_before`, `search`, `ordering`.

### `listSbirSolicitations(options?)` / `getSbirSolicitation(solicitationId, options?)`

```ts
const cycles = await client.listSbirSolicitations({ program: "SBIR", year: 2026 });
```

Typed filters: `solicitation_number`, `solicitation_status`, `program`, `activity`, `cycle_name`, `out_of_cycle`, `year`, `start_date_after` / `start_date_before`, `end_date_after` / `end_date_before`, `search`, `ordering`.

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

Labor Categories (`/api/idvs/{key}/lcats/`) attached to an IDV.

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
const psc = await client.listPsc({ has_awards: true });
const code = await client.getPsc("D302");
```

`has_awards: true` restricts the list to PSC codes that actually appear on awards.

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

Named wrappers: `iterateContracts`, `iterateEntities`, `iterateOpportunities`, `iterateNotices`, `iterateGrants`, `iterateForecasts`, `iterateIdvs`, `iterateVehicles`, `iterateDibbsRfqs`, `iterateDibbsRfps`, `iterateDibbsAwards`, `iterateExclusions`, `iterateSbirTopics`, `iterateSbirSolicitations`.

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

`createWebhookEndpoint` accepts the canonical snake_case shape (`callback_url`, `is_active`, `name`) or the legacy camelCase aliases (`callbackUrl`, `isActive`). If `name` is not provided, the SDK falls back to the URL host.

```ts
// Create (canonical snake_case)
const created = await client.createWebhookEndpoint({
  name: "Prod receiver",
  callback_url: "https://example.com/tango/webhooks",
  // is_active defaults to true on create
});

// Legacy camelCase still works:
const created2 = await client.createWebhookEndpoint({
  callbackUrl: "https://example.com/tango/webhooks",
  isActive: true,
});

// Update
await client.updateWebhookEndpoint(created.id, { is_active: false });

// Delete
await client.deleteWebhookEndpoint(created.id);
```

### `testWebhookEndpoint(endpointId)`

Send an immediate test webhook to a specific endpoint. `endpointId` is required. The SDK sends `{ endpoint: <id> }` in the request body (canonical post-tango#2252 cleanup; the API also accepts `endpoint_id` as a deprecated alias).

```ts
const result = await client.testWebhookEndpoint("ENDPOINT_UUID");
console.log(result.success, result.status_code);
```

### `testWebhookDelivery(options?)` _(legacy alias)_

Legacy wrapper around `testWebhookEndpoint`. `endpointId` may be omitted, in which case the API auto-resolves the user's only endpoint (404 if 0, 400 if >1). Prefer `testWebhookEndpoint` for new code.

```ts
const result = await client.testWebhookDelivery({ endpointId: "ENDPOINT_UUID" });
```

### `getWebhookSamplePayload(options?)`

Fetch Tango-shaped sample deliveries.

```ts
const sample = await client.getWebhookSamplePayload({ eventType: "alerts.contract.match" });
```

### Webhook Alerts

The Alerts API is a filter-subscription convenience layer on top of subscriptions. The SDK uses cleaner field names than the underlying API: `name` (vs `subscription_name`), `filters` (vs `filter_definition`), and singular `query_type` values.

```ts
// Create
const alert = await client.createWebhookAlert({
  name: "New IT cloud contracts",                  // vs subscription_name on the wire
  query_type: "contract",                          // SINGULAR — not "contracts"
  filters: { naics: "541511" },                    // vs filter_definition on the wire
  frequency: "realtime",                           // realtime | daily | weekly | custom
  cron_expression: undefined,                      // required if frequency === "custom"
});

// List
const alerts = await client.listWebhookAlerts({ page: 1, pageSize: 25 });

// Get / Update / Delete
const got = await client.getWebhookAlert("ALERT_UUID");
await client.updateWebhookAlert("ALERT_UUID", { name: "Updated name" });
await client.deleteWebhookAlert("ALERT_UUID");
```

Notes:

- `name` and `query_type` are required on create. `query_type` is **singular** (e.g. `"contract"`, not `"contracts"`).
- Only `name`, `frequency`, `cronExpression`, and `isActive` are writable via `updateWebhookAlert` — `query_type` and `filters` are read-only after creation.

### Deliveries / redelivery

The API does not currently expose a public `/api/webhooks/deliveries/` or redelivery endpoint. Use:

- `testWebhookEndpoint(endpointId)` for connectivity checks
- `getWebhookSamplePayload()` for building handlers + alert payloads

### Receiving webhooks (signature verification)

Every delivery includes an HMAC signature header:

- `X-Tango-Signature: sha256=<hex digest>`

Use the SDK's `verifySignature` helper — **do not hand-roll HMAC**. Verify against the **raw request body bytes** (not a re-serialized parsed body). Arg order is `(body, header, secret)`.

```ts
import { verifySignature } from "@makegov/tango-node";

// Express — use express.raw() to get the body as a Buffer before JSON parsing
app.post("/tango/webhooks", express.raw({ type: "application/json" }), (req, res) => {
  const rawBody = req.body; // Buffer
  const signatureHeader = req.headers["x-tango-signature"];

  if (!verifySignature(rawBody, signatureHeader, process.env.TANGO_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: "invalid_signature" });
  }

  const payload = JSON.parse(rawBody.toString("utf8"));
  // ... handle payload.events ...
  res.json({ ok: true });
});
```

`verifySignature` signature:

```ts
function verifySignature(body: string | Buffer, header: string | null | undefined, secret: string): boolean;
```

Returns `false` for missing, malformed, or mismatched headers — never throws on mismatch. Uses `timingSafeEqual` internally. See [`WEBHOOKS.md` § Signature verification](WEBHOOKS.md#signature-verification-in-your-handler) for Fastify and framework-agnostic examples.

---

## Error Types

All thrown by async methods:

- `TangoAPIError`
- `TangoAuthError`
- `TangoNotFoundError`
- `TangoRateLimitError`
- `TangoTimeoutError`
- `TangoValidationError`
- `ShapeError`
- `ShapeParseError`
- `ShapeValidationError`
- `TypeGenerationError`
- `ModelInstantiationError`

### Structured validation details on `TangoValidationError`

When the API rejects a request with a structured 400 payload (shape errors especially), `TangoValidationError` exposes it without any hand-parsing of `responseData`:

- `err.issues` — the API's issue entries, e.g. `[{ path: "tradeoff_process", reason: "unknown_field" }]`; an empty array when the response carried no structured issues.
- `err.availableFields` — the endpoint's valid field set when the API includes one, else `null`.

```ts
try {
  await client.listContracts({ shape: "key,tradeoff_process" });
} catch (err) {
  if (err instanceof TangoValidationError) {
    for (const issue of err.issues) console.error(issue.path, issue.reason);
    console.error("valid fields:", err.availableFields);
  }
}
```

---

## Pagination

All list endpoints return:

```ts
interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  pageMetadata: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  agencyWarnings: string[];
  unresolvedAgencyTokens: Record<string, string[]>;
  resolvedAgencies: Record<string, Array<Record<string, unknown>>>;
  cursor: string | null;
  results: T[];
}
```

You can follow `next` / `previous` manually, pass `cursor` back on keyset-paginated endpoints, or use the `iterate*` helpers.

### Response `meta` and agency-filter diagnostics

`meta` carries any response-level metadata the API attached to the page — currently agency-filter resolution diagnostics.
Three parsed views are always present (empty rather than throwing when `meta` is absent or malformed):

- `agencyWarnings` — human-readable notes about agency tokens that were dropped or matched loosely; a non-empty list means part of your filter did not apply, so a small or empty `results` is not evidence that no such records exist.
- `unresolvedAgencyTokens` — tokens that matched no organization, keyed by filter name; check this to fail loudly in a pipeline instead of trusting a silently-narrowed result set.
- `resolvedAgencies` — the organizations each token actually resolved to, keyed by filter name; agency resolution is fuzzy, so checking the resolved `name` is the only way to catch a token matching an agency you did not intend.

```ts
const resp = await client.listContracts({ awarding_agency: "Navvy" });
if (resp.agencyWarnings.length > 0) {
  console.warn(resp.agencyWarnings);
  console.warn("unresolved:", resp.unresolvedAgencyTokens);
  console.warn("resolved to:", resp.resolvedAgencies);
}
```
