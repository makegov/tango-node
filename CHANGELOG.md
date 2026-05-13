<!-- markdownlint-disable MD024, MD013 -->
# Changelog

All notable changes to `@makegov/tango-node` will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-05-13

First stable release. `tango-node` is now at **full feature parity** with both the Tango API and `tango-python` for the surface that remains after the subject-based webhook removal (see "Removed" below). Every read method and every endpoint/alert/signing helper available on `tango_python.TangoClient` has an idiomatic camelCase counterpart on `TangoClient`, the SDK's docs are auto-published to `docs.makegov.com/sdks/node/` via the composer pipeline (makegov/docs#15 / makegov/docs#16), and from `1.x` on we'll only ship breaking changes on a major bump.

### Changed (breaking)

- **`createWebhookEndpoint({ name, ... })`** — `name` is now required. Previously the SDK silently fell back to the callback URL's host when `name` was omitted, which masked the server's `unique(user, name)` constraint until the second duplicate endpoint. Raising client-side gives a clearer error and matches `tango-python` 1.0.0's behavior.
- **`createWebhookAlert({ filters, ... })`** — `filters` is now validated as a non-empty plain object. Previously `{}` and arrays passed the check; the error message claimed "non-empty object" but didn't enforce it. Matches the server-side validation.

### Fixed

- `tests/unit/client.iterate.test.ts` — corrected the comment above the first `page` assertion; previous text claimed the first call should NOT carry a page, but the assertion (correctly) expects `page=1` since `listContracts` defaults to it.
- `docs/DEVELOPERS.md` — `listContracts({ offset: 25 })` example replaced with `{ page: 2 }` and "manual offset tracking" → "manual page/cursor tracking" (the method has never accepted `offset`).
- `CHANGELOG.md` — corrected "4 new unit test files" to "5"; the parenthesized list always contained 5 paths.
- Lint cleanup ahead of the npm publish — 44 redundant `as AnyRecord` / `as <T>` type-assertion casts dropped across `src/` (`@typescript-eslint/no-unnecessary-type-assertion` fires under the newer plugin minor that CI resolves). `src/webhooks/receiver.ts`: dropped the unused `AddressInfo` import, simplified `Delivery.bodyJson: unknown | null` → `unknown` (the latter already includes `null`), and restructured `WebhookReceiver.run()` to avoid `const receiver = this` (replaced with arrow-function closures over `getUrl`/`getDeliveries`/`stop`). No behavior change — tests still pass 220/220.
- `eslint.config.js` — disabled the core `no-undef` rule for TS files. TypeScript itself does undefined-symbol checking with knowledge of TS-only types (`AsyncDisposable`, `Disposable`, etc.); the core rule double-fires and false-flags those. Matches the typescript-eslint upstream guidance.

### Internal

- Pinned `devDependencies` to exact versions (dropped `^` from `package.json`). The previous unpinned ranges + gitignored `package-lock.json` meant CI re-resolved deps on every run and could pick up minor versions with stricter behavior that local installs hadn't seen yet — that's how the lint mismatch above slipped past local checks.

### Docs

- **README** updated for the docs-review sweep:
  - Added `TangoTimeoutError` to the documented error class list (it has been exported from `src/errors.ts` since v0.4 but the README omitted it).
  - Replaced the "_(Coming Soon!)_" marker on the docs link with the live `https://docs.makegov.com/sdks/node/` URL.
  - Rewrote the "Comprehensive API Coverage" feature bullet — the old enumeration listed fewer than half of the actually-implemented domains. New bullet points at the canonical "API Methods" section for the full surface.
- New `docs/CLIENT.md` — `TangoClient` constructor reference, environment variables, full retry/backoff semantics (including `Retry-After` handling), error-handling patterns, `fetchImpl` injection, and staging/local targeting. Ported from `docs.makegov.com/sdks/node/client.md` ahead of the docs-site auto-pull cutover (makegov/docs#15 / makegov/docs#16).
- `docs/API_REFERENCE.md` enriched with notes from the docs-site `methods.md` that hadn't been folded in yet: `listContracts` page/cursor mutual exclusion, `getIdvSummary` / `listIdvSummaryAwards` deprecation (server returns 404), `listIdvLcats` clarification, `listOrganizations` `level` semantics, `createWebhookEndpoint` snake_case canonical vs camelCase legacy aliases (`name` is required either way per the 1.0.0 change above), `testWebhookEndpoint` post-#2252 cleanup (`{ endpoint: <id> }` is canonical), and `createWebhookAlert` field-rename notes (`name` vs `subscription_name`, `filters` vs `filter_definition`, singular `query_type`, update-writable field list).

### CI

- New `.github/workflows/docs-dispatch.yml` — fires on push to `main` when `docs/**`, `README.md`, or `CHANGELOG.md` changes and dispatches `external_updated` at `makegov/docs` so the public docs site rebuilds with the latest SDK content. Required for the makegov/docs#15 auto-pull pipeline.

### Parity closure — all previously-tracked gaps addressed

Every gap surfaced in the May 2026 parity audit is now closed:

#### Typed filter `Options` interfaces

- `listForecasts`, `listOpportunities`, `listNotices`, `listGrants` — previously `ListOptionsBase & Record<string, unknown>` with zero typed filters; now ship full `Options` interfaces (`ListForecastsOptions`, `ListOpportunitiesOptions`, `ListNoticesOptions`, `ListGrantsOptions`) enumerating every filter kwarg from the Python signatures. `ListNoticesOptions` deliberately omits `ordering` (server rejects it).
- `ListContractsOptions` expanded to enumerate all 27+ Python kwargs (`award_date*`, `awarding_agency`, `funding_agency`, `obligated_gte/lte`, `pop_*`, `expiring_*`, `keyword`/`recipient_name`/`recipient_uei`/`set_aside_type`/`naics_code`/`psc_code` aliases, `sort`+`order`→`ordering`, etc.).
- `ListEntitiesOptions` expanded with the 12 Python kwargs (`cage_code`, `naics`, `name`, `psc`, `purpose_of_registration_code`, `socioeconomic`, `state`, `total_awards_obligated_gte/lte`, `uei`, `zip_code`).
- `ListVehiclesOptions` expanded with all 21 filter kwargs (`vehicle_type`, `type_of_idc`, `contract_type`, `who_can_use`, `total_obligated_min/max`, etc.).
- `ListIdvsOptions` expanded with the full IDV filter surface.
- `ListOtasOptions` / `ListOtidvsOptions` expanded with the missing `_gte`/`_lte` ranges (`award_date_gte/lte`, `fiscal_year_gte/lte`, `expiring_gte/lte`, `pop_start_date_gte/lte`, `pop_end_date_gte/lte`).
- `ListAgenciesOptions` added (was inline `{ page?, limit? }`).

All `Options` interfaces keep a `[key: string]: unknown` index signature for forward-compatibility with new server-side filters that haven't been ported yet — typed fields give autocomplete and typo-protection on known filters; unknown fields still pass through.

#### `ShapeConfig` preset parity

Added: `PROTESTS_MINIMAL`, `OTAS_MINIMAL`, `OTIDVS_MINIMAL`, `SUBAWARDS_MINIMAL`, `GSA_ELIBRARY_CONTRACTS_MINIMAL`, `ORGANIZATIONS_MINIMAL`, `VEHICLE_ORDERS_MINIMAL`, `ITDASHBOARD_INVESTMENTS_MINIMAL`, `ITDASHBOARD_INVESTMENTS_COMPREHENSIVE`.

Updated to match Python field lists: `ENTITIES_COMPREHENSIVE` (now uses `federal_obligations(*)` expansion), `VEHICLES_MINIMAL` (extended to mirror Python's larger field list), `VEHICLES_COMPREHENSIVE` (dropped `competition_details(*)` per SDK v0.6.0; added `program_acronym`, `is_synthetic_solicitation`, `metrics(*)`, organization expansion).

#### Explicit schemas

Added 11 schemas + registry entries: `ORGANIZATION_OFFICE_SCHEMA`, `VEHICLE_METRICS_SCHEMA`, `ORGANIZATION_SCHEMA`, `OTA_SCHEMA`, `OTIDV_SCHEMA`, `SUBAWARD_SCHEMA`, `PROTEST_DOCKET_SCHEMA`, `PROTEST_SCHEMA`, `GSA_ELIBRARY_IDV_REF_SCHEMA`, `GSA_ELIBRARY_CONTRACT_SCHEMA`, `ITDASHBOARD_INVESTMENT_SCHEMA`. Wired into the `EXPLICIT_SCHEMAS` registry under canonical model names.

Also extended `VEHICLE_SCHEMA` with the fields the new `VEHICLES_*` presets reference: `is_synthetic_solicitation`, `program_acronym`, `organization` (expandable to `OrganizationOffice`), `metrics` (expandable to `VehicleMetrics`), `idv_count`, `total_obligated`, `latest_award_date`, `opportunity_id`, `description`.

#### Typed return models

- `client.resolve(input)` → `Promise<ResolveResult>` with typed `ResolveCandidate[]` (was `Promise<{ candidates: AnyRecord[]; count: number }>`).
- `client.validate(input)` → `Promise<ValidateResult>` (was `Promise<AnyRecord>`).
- `client.getAgency(code)` → `Promise<AgencyRecord>` (was `Promise<AnyRecord>`).
- `client.getProtest(caseNumber)` → `Promise<ProtestRecord>` with typed `docket`, `resolved_*`, etc.

All new types exported from package root.

#### Observability — `rateLimitInfo` + `lastResponseHeaders`

Two new instance properties on `TangoClient` mirroring Python's `rate_limit_info` / `last_response_headers`:

```typescript
await client.listContracts({ limit: 5 });
console.log(client.rateLimitInfo);
// { remaining: 98, limit: 100, resetIn: 60, retryAfter: null, limitType: "per_minute" }
console.log(client.lastResponseHeaders?.["x-request-id"]);
```

Both `null` until the first request completes; populated after every successful request. `HttpClient` parses `X-RateLimit-{Remaining,Limit,Reset,Type}` + `Retry-After` headers into a `RateLimitInfo` snapshot.

#### `listContracts` cursor pagination (non-breaking)

`ListContractsOptions` now accepts `cursor` alongside `page`. When `cursor` is supplied, the request omits `page` and uses keyset pagination (Python parity); otherwise falls back to page-based. `PaginatedResponse` gained a `cursor` field auto-extracted from `next` so callers can `client.listContracts({ cursor: resp.cursor })` for the next page without parsing the URL themselves.

#### `WebhookReceiver` framework

New `src/webhooks/receiver.ts`. `WebhookReceiver` dataclass-style class with `start()`, `stop()`, `url`, `deliveries`, `onDelivery` callback, optional `forwardTo` mirror, history cap, signature verification (via existing `verifySignature`). Two run patterns shipped:

- `await using rx = await new WebhookReceiver(opts).run();` (modern, `Symbol.asyncDispose`).
- `await WebhookReceiver.withRunning(opts, async (rx) => { ... });` (portable callback scope).

Pure `node:http` + native `fetch` — no new dependencies.

#### Webhook simulator

New `src/webhooks/simulate.ts`. `sign(payload, secret)` returns a `SignedRequest` (body bytes, signature header value, content-type). `deliver({ targetUrl, payload, secret, ... })` signs and POSTs via native `fetch` with `AbortSignal.timeout()`. Includes a `stableStringify` helper that matches Python's `json.dumps(sort_keys=True, separators=(",", ":"))` byte-for-byte so signatures are reproducible across languages.

#### Webhook CLI — `tango-node webhooks`

New `bin/tango-node` (entry in `src/bin/tango-node.ts`) backed by `commander`. Subcommands: `listen`, `simulate`, `trigger`, `fetch-sample`, `list-event-types`, `endpoints {list, get, create, delete}` — mirroring the Python `tango webhooks` CLI. New runtime dep: `commander@^12.1.0`.

#### Conformance gate

New `scripts/check-filter-shape-conformance.ts` + `npm run check-conformance` script. Walks `src/client.ts` with the TypeScript compiler AST, extracts each `list*` method's `Options` interface, and validates against the canonical manifest at `tango/contracts/filter_shape_contract.json`. JSON output + exit codes match the Python conformance script. Current state: **0 errors, 0 warnings** — parity verified.

#### Test coverage

Net **+74 tests** across the new work (220 total now passing, up from 146 pre-audit):

- ShapeConfig preset parity (`config.shapes.parity`)
- Explicit schema parity (`shapes.schema.parity`, 12 tests)
- WebhookReceiver lifecycle, signature paths, forwarding, history cap, `withRunning` + `Symbol.asyncDispose` (`webhooks/receiver`, 21 tests)
- Webhook simulator stable-stringify, sign-verify round-trip, deliver against a real `http.createServer`, timeout (`webhooks/simulate`, 17 tests)
- CLI subcommand wiring (`webhooks/cli`, 7 tests)
- Conformance script (`scripts/conformance`, 5 tests)
- Observability + cursor pagination + typed return models (`client.observability`, 11 tests)

### Internal

- `tsx` added as a devDependency to run the new conformance script.
- `HttpClient` constructor body unchanged; just adds two readonly fields (`lastResponseHeaders`, `rateLimitInfo`) populated on every successful response.

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
- **`Subaward` schema matches the server's `SubawardSerializer`.** The previous `SUBAWARD_SCHEMA` (ported from the broken Python schema) declared two fields the server has never exposed (`id`, `amount`) and was missing every real field — including `piid`, `key`, `awarding_office` / `funding_office` / `place_of_performance` / `subaward_details` / `fsrs_details` / `highly_compensated_officers` / `usaspending_permalink`, and the denormalized `prime_awardee_*` / `recipient_*` lookup columns. Shape strings that referenced any real field (e.g. `shape: "piid"`) would fail client-side validation with `unknown_field`. `SUBAWARD_SCHEMA` is now derived directly from `awards.serializers.subawards.SubawardSerializer` and the resource's runtime `available_fields`. New nested schemas `SubawardDetails`, `FsrsDetails`, `SubawardPlaceOfPerformance`, and `HighlyCompensatedOfficer` are registered so the corresponding shape expansions validate end-to-end.

### Internal

- Live smoke harnesses at `scripts/smoke-{reads,writes,extras,parity}.ts` exercise every new method against a running Tango instance. All four require `TANGO_API_KEY` in the environment (hard-fail if unset — no fallback).
- 5 new unit test files (`tests/unit/{client.parity,client.iterate,client.baseurl,webhooks.signing,config.shapes}.test.ts`) added; total suite is now 16 files / 111 tests / 82% line coverage.
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
