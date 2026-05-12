<!-- markdownlint-disable MD024, MD013 -->
# Changelog

All notable changes to `@makegov/tango-node` will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

This release brings `tango-node` to **full feature parity** with both the Tango API and the `tango-python` SDK for the surface that remains after the subject-based webhook removal (see "Removed" below). Every read method and every endpoint/alert/signing helper available on `tango_python.TangoClient` now has an idiomatic camelCase counterpart on `TangoClient`.

### Docs

- **README** updated for the docs-review sweep:
  - Added `TangoTimeoutError` to the documented error class list (it has been exported from `src/errors.ts` since v0.4 but the README omitted it).
  - Replaced the "_(Coming Soon!)_" marker on the docs link with the live `https://docs.makegov.com/sdks/node/` URL.
  - Rewrote the "Comprehensive API Coverage" feature bullet — the old enumeration listed fewer than half of the actually-implemented domains. New bullet points at the canonical "API Methods" section for the full surface.

### Known gaps (tracked, not addressed in this release)

Audit against `tango-python` (`feat/api-parity`, May 2026) surfaced several intentional parity gaps that will land in subsequent minors:

- **Typed `Options` interfaces for list-method filters.** Most `list*` methods currently accept filters via `[key: string]: unknown` index signatures. Python enumerates filter parameters as explicit kwargs (per `CLAUDE.md` non-negotiable). To close: enumerate the same kwargs in typed `Options` interfaces per method.
- **`ShapeConfig` presets** missing on Node: `PROTESTS_MINIMAL`, `VEHICLE_ORDERS_MINIMAL`, `ORGANIZATIONS_MINIMAL`, `OTAS_MINIMAL`, `OTIDVS_MINIMAL`, `SUBAWARDS_MINIMAL`, `GSA_ELIBRARY_CONTRACTS_MINIMAL`, `ITDASHBOARD_INVESTMENTS_MINIMAL`, `ITDASHBOARD_INVESTMENTS_COMPREHENSIVE`. Calls to those endpoints currently send `shape=undefined` and get the server's default shape (not Python's curated minimal).
- **Explicit schemas** missing on Node: `ORGANIZATION_SCHEMA`, `OTA_SCHEMA`, `OTIDV_SCHEMA`, `SUBAWARD_SCHEMA`, `PROTEST_SCHEMA`, `PROTEST_DOCKET_SCHEMA`, `GSA_ELIBRARY_*`, `ITDASHBOARD_INVESTMENT_SCHEMA`, `VEHICLE_METRICS_SCHEMA`, `ORGANIZATION_OFFICE_SCHEMA`. Those endpoints fall through to raw passthrough (`_genericPaginatedList`) without `modelFactory`.
- **Typed return models** for `resolve`, `validate`, `getAgency`, `getProtest`, etc. — all currently `AnyRecord`.
- **WebhookReceiver / CLI / simulator** — Python ships them; Node ships only signature helpers (`signing.ts`). Receiver framework and CLI are the largest gap.
- **`rate_limit_info` + `last_response_headers`** instance properties — present on Python `TangoClient`, missing on Node.
- **Conformance script** equivalent to `tango-python/scripts/check_filter_shape_conformance.py` — there is currently no gate validating Node against the canonical filter/shape manifest.
- **Pagination drift on `listContracts`** — Python is cursor-based, Node is page-based. The API supports both. To be resolved as a deliberate SDK design choice in a future minor.

### Removed

- **Subject-based webhook subscriptions** are gone. The Tango API is dropping the `/api/webhooks/subscriptions/` surface for subject delivery (see [makegov/tango#2267](https://github.com/makegov/tango/issues/2267)); `tango-node` mirrors that here. Removed methods: `listWebhookSubscriptions`, `getWebhookSubscription`, `createWebhookSubscription`, `updateWebhookSubscription`, `deleteWebhookSubscription`. Removed types: `WebhookSubscription`, `WebhookSubscriptionCreateInput`, `WebhookSubscriptionUpdateInput`, `WebhookSubscriptionPayload`, `WebhookSubscriptionPayloadRecord`, `WebhookSubjectTypeDefinition`, `WebhookSampleSubject`, `ListWebhookSubscriptionsOptions`. `WebhookEventTypesResponse` no longer carries `subject_types` / `subject_type_definitions`; `WebhookEventType` no longer carries `default_subject_type`; sample-payload responses no longer carry `sample_subjects` / `sample_subscription_requests`. Use `createWebhookAlert` (filter-based delivery via `/api/webhooks/alerts/`) — that's the only remaining subscription path.

SemVer-major (`0.3.0` → `0.4.0`).

### Added

#### API parity — read methods

- **Lookups**: `listNaics`, `getNaics`, `listPsc`, `getPsc`, `listMasSins`, `getMasSin`, `listAssistanceListings`, `getAssistanceListing`, `listOrganizations`, `getOrganization`, `listOffices`, `getOffice`, `listDepartments` (`@deprecated` JSDoc), `getDepartment`, `getBusinessType`.
- **Awards completeness**: `listOtas`, `getOta`, `listOtidvs`, `getOtidv`, `listOtidvAwards`, `listSubawards`, `listGsaElibraryContracts`, `listLcats` (accepts `{ uei }` or `{ idvKey }`).
- **Other resources**: `listProtests`, `getProtest`, `listItDashboard`, `getItDashboard`, `listMetrics` (parameterized over `ownerType` since the API exposes metrics only under owner-scoped paths).
- **Utility endpoints**: `resolve(input)` (POST `/api/resolve/` — returns `{ candidates, count }`), `validate(input)` (POST `/api/validate/`).

#### API parity — typed wrappers for Python's `get_*_metrics` helpers

- `getEntityMetrics(uei, months, periodGrouping)`
- `getNaicsMetrics(code, months, periodGrouping)`
- `getPscMetrics(code, months, periodGrouping)`

#### API parity — entity, IDV, and agency sub-resources

- `listEntityContracts`, `listEntityIdvs`, `listEntityOtas`, `listEntityOtidvs`, `listEntitySubawards`, `listEntityLcats`
- `listIdvLcats(key, options?)` — typed sibling of the generic `listLcats({ idvKey })`
- `listAgencyAwardingContracts`, `listAgencyFundingContracts`

#### Webhook write API

- Endpoints: `createWebhookEndpoint` (now `name` is first-class; defaults to URL host if omitted), `updateWebhookEndpoint`, `deleteWebhookEndpoint`. `testWebhookEndpoint(endpointId)` is the canonical method; `testWebhookDelivery` is kept as an auto-resolving variant (omit `endpointId` to let the API pick the sole endpoint).
- Alerts (filter-subscription API): `listWebhookAlerts`, `getWebhookAlert`, `createWebhookAlert`, `updateWebhookAlert`, `deleteWebhookAlert`. `WebhookAlertCreateInput` now has an optional `endpoint` field — required for multi-endpoint accounts, optional for single-endpoint accounts (the API auto-resolves). Server support landed in [makegov/tango#2256](https://github.com/makegov/tango/issues/2256).

New typed input interfaces exported from the package root: `WebhookEndpointCreateInput`, `WebhookEndpointUpdateInput`, `WebhookAlertCreateInput`, `WebhookAlert`, plus options types for the new sub-resources.

#### Webhook signature helpers (parity with `tango_python.webhooks.signing`)

- `verifySignature(body, header, secret)` — constant-time HMAC-SHA256 verification. Accepts `"sha256=<hex>"` and bare-hex forms. Returns `boolean`, never throws.
- `generateSignature(body, secret)` — emits `"sha256=<hex>"` matching the dispatcher format.
- `parseSignatureHeader(header)` — returns `{ algorithm, signature } | null` for cleaner branching in receivers.

All exported from the package root; receivers don't need to instantiate `TangoClient`.

#### Async iterator pagination

For convenience, list methods now have async-iterator wrappers that handle `next` / `cursor` for you:

```typescript
for await (const contract of client.iterateContracts({ awarding_agency: "9700" })) {
  console.log(contract.piid, contract.total_contract_value);
}
```

Typed iterators: `iterateContracts`, `iterateEntities`, `iterateOpportunities`, `iterateNotices`, `iterateGrants`, `iterateForecasts`, `iterateIdvs`, `iterateVehicles`. Iteration is sequential (no concurrent requests) to respect API rate limits.

#### Retry with exponential backoff

`HttpClient` now automatically retries failed requests:

- Retries on 5xx, 408 (Request Timeout), 429 (Too Many Requests), network errors, and client-side timeouts.
- Does **not** retry on other 4xx — those surface as the appropriate `Tango*` error immediately.
- Exponential backoff: base `retryBackoffMs` (default 250ms), doubled per attempt, capped at 10s.
- Honors `Retry-After` headers (delta-seconds and HTTP-date) on 429/503.

#### Constructor surface

- `retries` (default `3`) and `retryBackoffMs` (default `250`) options on `TangoClientOptions`. Set `retries: 0` to disable.
- `timeout` accepted as a shorthand alias for `timeoutMs` (both in ms; `timeoutMs` wins if both are supplied).

#### Environment variable fallback

- `TANGO_BASE_URL` env var is now read when `baseUrl` is not passed to the constructor — parity with `TANGO_API_KEY`.

#### Misc

- `searchOpportunityAttachments`, `getVersion`, `listApiKeys` round out parity with the Python SDK's introspection / search surface.
- Shape generator now accepts `naics(code,description)` / `psc(code,description)` as canonical expands on Contract, Opportunity, Notice, Forecast, and Vehicle (IDV already had them). Mirrors `makegov/tango#2259`. (refs `makegov/tango#2265`)

### Changed

- `createWebhookEndpoint` and related write methods accept the canonical Tango API payload shape in addition to the previous camelCase wrappers — see the new typed input interfaces.
- `testWebhookEndpoint` / `testWebhookDelivery` now send the canonical `{ endpoint }` body key instead of the deprecated `{ endpoint_id }` (server still accepts both as aliases). Tracks [makegov/tango#2252](https://github.com/makegov/tango/issues/2252).
- `ListSubawardsOptions.ordering` narrowed from `string` to the literal union `"last_modified_date" | "-last_modified_date"`, matching the server-side enum (no other values are accepted; others 400). Tracks [makegov/tango#2254](https://github.com/makegov/tango/issues/2254).
- Shape generator rewrites legacy `naics_code(...)` / `psc_code(...)` expand spellings to canonical `naics(...)` / `psc(...)` before validation, matching the server's `_EXPAND_ALIASES` map. Scalar `naics_code` / `psc_code` (no parens) is untouched and still returns the raw column value. (refs `makegov/tango#2265`, `makegov/tango#2259`)

### Fixed

- `ShapeConfig.IDVS_COMPREHENSIVE` no longer includes `base_and_exercised_options_value`, which is not a valid IDV shape field — the API was returning `400 Invalid shape` on this preset. Now aligned with `tango_python.IDVS_COMPREHENSIVE`. Also reconciled `recipient.cage_code` → `recipient.cage` to match the Python preset exactly.
- `createWebhookAlert` now plumbs an explicit `endpoint` UUID through to the API. Multi-endpoint accounts can now create alerts directly instead of relying on the server's single-endpoint auto-resolution. Tracks [makegov/tango#2256](https://github.com/makegov/tango/issues/2256).

### Internal

- Live smoke harnesses at `scripts/smoke-{reads,writes,extras,parity}.ts` exercise every new method against a running Tango instance. All four require `TANGO_API_KEY` in the environment (hard-fail if unset — no fallback).
- 4 new unit test files (`tests/unit/{client.parity,client.iterate,client.baseurl,webhooks.signing,config.shapes}.test.ts`) added; total suite is now 16 files / 111 tests / 82% line coverage.
- ESM build (`tsc -p tsconfig.json`) clean.

## [0.3.0] - 2026-02-09

### Added

- Vehicles endpoints: `listVehicles`, `getVehicle`, and `listVehicleAwardees` (supports shaping + flattening). (refs `makegov/tango#1327`)
- IDV endpoints: `listIdvs`, `getIdv`, `listIdvAwards`, `listIdvChildIdvs`, `listIdvTransactions`, `getIdvSummary`, `listIdvSummaryAwards`. (refs `makegov/tango#1327`)
- Webhooks v2 client support: event type discovery, subscription CRUD, endpoint management, test delivery, and sample payload helpers. (refs `makegov/tango#1275`)

### Changed

- HTTP client now supports PATCH/PUT/DELETE for non-GET endpoints.
- `joiner` is now respected when unflattening `flat=true` responses on supported endpoints.

## [0.1.0] - 2025-11-21

- Initial Node.js port of the Tango Python SDK.
- Basic project scaffolding for client, models, and shapes.
- ESM + TypeScript build configuration.

## [0.1.4] - 2025-11-21

- Added tests and cleaned up formatting and structure of SDK.
