# Changelog

All notable changes to `@makegov/tango-node` will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

<!-- markdownlint-disable MD024 -->

## [Unreleased]

This release brings `tango-node` to **full feature parity** with both the Tango API and the `tango-python` SDK. Every method available on `tango_python.TangoClient` now has an idiomatic camelCase counterpart on `TangoClient`. 84 public methods, 16 test files, 111 passing unit tests, 82% line coverage.

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

- Subscriptions: `createWebhookSubscription`, `updateWebhookSubscription`, `deleteWebhookSubscription`. Accepts both the canonical snake_case payload (`subscription_name`, `subscription_type`, `endpoint`, `query_type`, `filter_definition`, …) and the legacy `{ subscriptionName, payload }` camelCase shape for backward compatibility.
- Endpoints: `createWebhookEndpoint` (now `name` is first-class; defaults to URL host if omitted), `updateWebhookEndpoint`, `deleteWebhookEndpoint`. `testWebhookEndpoint(endpointId)` is the canonical method using the API's `{ endpoint_id }` body key; the prior `testWebhookDelivery` kept as an alias.
- Alerts (filter-subscription convenience wrapper): `listWebhookAlerts`, `getWebhookAlert`, `createWebhookAlert`, `updateWebhookAlert`, `deleteWebhookAlert`. Note: `createWebhookAlert` auto-resolves the caller's sole endpoint; accounts with multiple endpoints currently get a 400 from the API — tracked at [makegov/tango#2256](https://github.com/makegov/tango/issues/2256).

New typed input interfaces exported from the package root: `WebhookSubscriptionCreateInput`, `WebhookSubscriptionUpdateInput`, `WebhookEndpointCreateInput`, `WebhookEndpointUpdateInput`, `WebhookAlertCreateInput`, `WebhookAlert`, plus options types for the new sub-resources.

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

### Changed

- `createWebhookSubscription`, `createWebhookEndpoint`, and related write methods accept the canonical Tango API payload shape in addition to the previous camelCase wrappers — see the new typed input interfaces.

### Fixed

- `ShapeConfig.IDVS_COMPREHENSIVE` no longer includes `base_and_exercised_options_value`, which is not a valid IDV shape field — the API was returning `400 Invalid shape` on this preset. Now aligned with `tango_python.IDVS_COMPREHENSIVE`. Also reconciled `recipient.cage_code` → `recipient.cage` to match the Python preset exactly.

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
