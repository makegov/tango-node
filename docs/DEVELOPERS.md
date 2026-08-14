# Tango Node SDK – Developer Guide

The Tango Node SDK uses dynamic models that produce runtime-shaped objects matching the exact structure of API responses based on shape parameters. This gives you lean, predictable data with accurate TypeScript interfaces and great IDE autocomplete.

## Table of Contents

- [Overview](#overview)
- [Benefits](#benefits)
- [Getting Started](#getting-started)
- [Using Predefined Shapes](#using-predefined-shapes)
- [Creating Custom Shapes](#creating-custom-shapes)
- [Type Safety and IDE Support](#type-safety-and-ide-support)
- [Performance Considerations](#performance-considerations)
- [Troubleshooting](#troubleshooting)
- [SDK conformance (maintainers)](#sdk-conformance-maintainers)

## Overview

The SDK uses a shaping pipeline that generates typed, materialized objects at runtime based on the shape string you pass to each method. You only get the fields you asked for, with dates parsed to `Date`, decimals normalized to strings, and nested structures enforced.

**Dynamic shaping approach:**

```ts
import { TangoClient } from "@makegov/tango-node";

const client = new TangoClient({ apiKey: process.env.TANGO_API_KEY });

// Returns shaped objects with only the requested fields
const contracts = await client.listContracts({
  shape: "key,piid,recipient(display_name)",
});

const c = contracts.results[0];
c.key;                      // ✓
c.piid;                     // ✓
c.recipient.display_name;   // ✓
// award_date is absent — you didn't ask for it
```

The shaping pipeline has four stages:

1. **ShapeParser** — parses the shape string into a `ShapeSpec`
2. **SchemaRegistry** — validates field names against the SDK's explicit schemas
3. **TypeGenerator** — builds a `GeneratedModel` descriptor (cached with FIFO eviction)
4. **ModelFactory** — materializes raw API JSON into typed shaped objects

`TangoClient` runs this pipeline automatically on every shaped response. You can also use the components directly (see [Dynamic Models Guide](DYNAMIC_MODELS.md)).

## Benefits

### 1. Accurate Field Scope

Your data contains exactly what you asked for — no `undefined` noise from unrequested fields.

```ts
const contracts = await client.listContracts({
  shape: "key,piid,recipient(display_name)",
});

const c = contracts.results[0];
c.key;                     // ✓ present
c.piid;                    // ✓ present
c.recipient.display_name;  // ✓ present
// c.award_date → undefined — not in shape, not materialized
```

### 2. Automatic Type Coercion

The ModelFactory applies type rules from the schema on every object:

- `date` fields → `Date` instance
- `datetime` fields → `Date` instance
- `decimal` fields → normalized `string`
- nested objects → recursively shaped
- list fields → typed arrays

```ts
const c = contracts.results[0];
c.award_date instanceof Date;  // true — parsed automatically
typeof c.total_contract_value; // "string" — normalized decimal
```

### 3. Runtime Shape Validation

If you reference a field that doesn't exist in the schema, the SDK throws before making a network call:

```ts
await client.listContracts({ shape: "key,invalid_field" });
// ShapeValidationError: Field 'invalid_field' does not exist in Contract
```

### 4. Memory Efficiency

Shaped objects only contain the fields you requested.

```ts
// CONTRACTS_MINIMAL (6 fields) vs full response (50+ fields)
// Typical memory reduction: 60-80% for large result sets
```

### 5. Descriptor Caching

`TypeGenerator` caches the `GeneratedModel` descriptor for each unique shape string, so repeated calls with the same shape pay the parsing cost only once.

```ts
// First call: parses + validates + generates descriptor (~1-5ms)
const first = await client.listContracts({ shape: "key,piid" });

// Subsequent calls: descriptor served from cache (~0.1ms)
const second = await client.listContracts({ shape: "key,piid" });
```

## Getting Started

### Installation

```bash
npm install @makegov/tango-node
```

Requires Node 18 or higher (uses native `fetch`).

### Basic Usage

```ts
import { TangoClient, ShapeConfig } from "@makegov/tango-node";

const client = new TangoClient({ apiKey: process.env.TANGO_API_KEY });

const contracts = await client.listContracts({
  shape: ShapeConfig.CONTRACTS_MINIMAL,
  limit: 10,
});

for (const c of contracts.results) {
  console.log(c.piid, c.award_date, c.recipient.display_name);
}
```

### Environment Variables

| Variable         | Description                                               | Default                         |
| ---------------- | --------------------------------------------------------- | ------------------------------- |
| `TANGO_API_KEY`  | Your Tango API key                                        | *(required — no default)*       |
| `TANGO_BASE_URL` | Override the API base URL (e.g. for local dev/staging)    | `https://tango.makegov.com`     |

You can also pass `apiKey` and `baseUrl` directly to the constructor:

```ts
const client = new TangoClient({
  apiKey: "your-key",
  baseUrl: process.env.TANGO_BASE_URL, // falls back to default if undefined
});
```

## Using Predefined Shapes

`ShapeConfig` ships 25+ predefined shape strings optimized for common use cases — see [SHAPES.md](SHAPES.md#shapeconfig-presets) for the full table.

### Contracts

```ts
import { TangoClient, ShapeConfig } from "@makegov/tango-node";

const client = new TangoClient({ apiKey: process.env.TANGO_API_KEY });

// Default for listContracts()
const contracts = await client.listContracts({
  shape: ShapeConfig.CONTRACTS_MINIMAL,
  limit: 100,
});
// Fields: key, piid, award_date, recipient(display_name), description, total_contract_value
```

### Entities

```ts
// Default for listEntities() — fast lookups
const entities = await client.listEntities({
  shape: ShapeConfig.ENTITIES_MINIMAL,
  limit: 50,
});
// Fields: uei, legal_business_name, cage_code, business_types
// Note: entities use 'uei' as identifier, not 'key'

// Default for getEntity() — full vendor details
const entity = await client.getEntity("UEIXXXXXX", {
  shape: ShapeConfig.ENTITIES_COMPREHENSIVE,
});
// Fields: uei, legal_business_name, dba_name, cage_code, business_types, primary_naics,
//         naics_codes, psc_codes, email_address, entity_url, description, capabilities,
//         keywords, physical_address, mailing_address, federal_obligations, congressional_district
```

### IDVs

```ts
// Default for listIdvs()
const idvs = await client.listIdvs({
  shape: ShapeConfig.IDVS_MINIMAL,
});
// Fields: key, piid, award_date, recipient(display_name,uei), description,
//         total_contract_value, obligated, idv_type

// Default for getIdv()
const idv = await client.getIdv("IDV-KEY", {
  shape: ShapeConfig.IDVS_COMPREHENSIVE,
});
```

### Vehicles

```ts
// Default for listVehicles()
const vehicles = await client.listVehicles({
  shape: ShapeConfig.VEHICLES_MINIMAL,
});

// Default for getVehicle()
const vehicle = await client.getVehicle("UUID", {
  shape: ShapeConfig.VEHICLES_COMPREHENSIVE,
});
```

### Forecasts, Opportunities, Notices, Grants

```ts
const forecasts     = await client.listForecasts({ shape: ShapeConfig.FORECASTS_MINIMAL });
const opportunities = await client.listOpportunities({ shape: ShapeConfig.OPPORTUNITIES_MINIMAL });
const notices       = await client.listNotices({ shape: ShapeConfig.NOTICES_MINIMAL });
const grants        = await client.listGrants({ shape: ShapeConfig.GRANTS_MINIMAL });
```

## Creating Custom Shapes

### Simple Custom Shapes

```ts
const contracts = await client.listContracts({
  shape: "key,piid,award_date,total_contract_value",
});

for (const c of contracts.results) {
  console.log(`${c.piid}: $${c.total_contract_value}`);
}
```

### Nested Field Selection

```ts
const contracts = await client.listContracts({
  shape: "key,piid,recipient(display_name,uei,cage_code)",
});

for (const c of contracts.results) {
  const r = c.recipient;
  if (r) {
    console.log(r.display_name, r.uei, r.cage_code);
  }
}
```

### Multiple Nested Objects

```ts
const contracts = await client.listContracts({
  shape: [
    "key,piid,award_date",
    "recipient(display_name,uei)",
    "awarding_office(office_code,office_name,agency_code,agency_name,department_code,department_name)",
    "place_of_performance(city_name,state_code,state_name,country_code,country_name)",
  ].join(","),
});

for (const c of contracts.results) {
  const office = c.awarding_office;
  const loc = c.place_of_performance;
  console.log(`Agency: ${office?.agency_name}`);
  console.log(`Location: ${loc?.city_name}, ${loc?.state_name}`);
}
```

### Wildcards

```ts
// All fields from a nested object
const contracts = await client.listContracts({
  shape: "key,piid,recipient(*)",
});

for (const c of contracts.results) {
  console.log(Object.keys(c.recipient ?? {}));
}
```

### Field Aliasing

```ts
const contracts = await client.listContracts({
  shape: "key,piid,recipient(display_name::vendor_name,uei)",
});

for (const c of contracts.results) {
  console.log(c.recipient?.vendor_name); // aliased field
}
```

## Type Safety and IDE Support

The SDK exports TypeScript interfaces for all models in `@makegov/tango-node/models`. These are fixed interfaces for the full model shape — they are not per-shape generated types. For type annotations on shaped results, use your own `interface` or type the result directly.

### Using model interfaces

```ts
import type { Contract } from "@makegov/tango-node/models";

// Full Contract interface — useful as a reference for field names
const c: Contract = contracts.results[0] as Contract;
```

### Typing shaped results manually

Because TypeScript cannot statically infer which fields a shape string requests, shaped objects are typed as `Record<string, unknown>` at the result level. Narrow explicitly when you care about type checking:

```ts
interface MinimalContract {
  key: string;
  piid: string | null;
  award_date: Date | null;
  total_contract_value: string | null;
  recipient: { display_name: string } | null;
}

const contracts = await client.listContracts({
  shape: "key,piid,award_date,total_contract_value,recipient(display_name)",
});

for (const raw of contracts.results) {
  const c = raw as MinimalContract;
  console.log(c.piid, c.recipient?.display_name);
}
```

### Runtime validation catches bad shapes early

The schema validation happens before the network call completes, so typos surface as `ShapeValidationError` immediately rather than silently missing data.

```ts
// This throws ShapeValidationError — caught before any data lands
await client.listContracts({ shape: "key,typo_field" });
```

## Performance Considerations

### Descriptor Caching

`TypeGenerator` caches `GeneratedModel` descriptors with FIFO eviction. `ShapeParser` also caches parse results. First call with a given shape string pays the generation cost; subsequent calls are near-zero.

```ts
// Descriptor generated once, reused for every call with this shape
const SHAPE = "key,piid,recipient(display_name)";
const page1 = await client.listContracts({ shape: SHAPE });
const page2 = await client.listContracts({ shape: SHAPE, page: 2 });
```

Store shape strings in constants (like `ShapeConfig`) rather than building them inline — identical strings hit the cache; equivalent-but-distinct strings miss.

### Memory Efficiency

Materialized objects contain only the fields in your shape. For bulk data pulls this matters:

```ts
// CONTRACTS_MINIMAL: ~6 fields per object
// Full response: 50+ fields, most null
// Expected reduction: 60–80% for typical shaped fetches
const contracts = await client.listContracts({
  shape: ShapeConfig.CONTRACTS_MINIMAL,
  limit: 1000,
});
```

### Pagination via `iterateContracts`

For large result sets, use the iterator methods rather than repeated `listContracts` calls with manual page/cursor tracking:

```ts
for await (const contract of client.iterateContracts({
  shape: ShapeConfig.CONTRACTS_MINIMAL,
  fiscal_year: 2024,
})) {
  // each page is fetched lazily
  process(contract);
}
```

## Troubleshooting

### ShapeValidationError: Field 'X' does not exist in Model

You referenced a field name that doesn't exist in the SDK's explicit schema for that model.

```ts
// ✗ Wrong
await client.listContracts({ shape: "key,piid,invalid_field" });
// ShapeValidationError: Field 'invalid_field' does not exist in Contract

// ✓ Correct
await client.listContracts({ shape: "key,piid,award_date" });
```

Check the SDK's `src/shapes/explicitSchemas.ts` for the canonical list of fields per model, or use one of the predefined `ShapeConfig` constants as a starting point.

### Field is `undefined` at runtime

You accessed a field that wasn't included in the shape.

```ts
// ✗ Wrong
const c = (await client.listContracts({ shape: "key,piid" })).results[0];
console.log(c.award_date); // undefined — not in shape

// ✓ Include the field in the shape
const c2 = (await client.listContracts({ shape: "key,piid,award_date" })).results[0];
console.log(c2.award_date); // Date instance
```

### TangoAuthError

Your API key is missing, invalid, or lacks the required permissions.

```ts
// Verify the key is set
console.log(process.env.TANGO_API_KEY?.slice(0, 4)); // should be non-empty
```

### TangoNotFoundError

The resource key you passed doesn't exist in the API.

### TangoRateLimitError

You've hit the API's rate limit. Back off and retry. The `timeoutMs` constructor option controls per-request timeout; rate limiting is an API-side concern.

### Debugging HTTP

Pass a custom `fetchImpl` during development to log requests:

```ts
const client = new TangoClient({
  apiKey: "test",
  fetchImpl: async (url, init) => {
    console.log("→", url);
    const res = await fetch(url, init);
    console.log("←", res.status);
    return res;
  },
});
```

The same `fetchImpl` option is used in unit tests to inject mock responses without hitting the network.

### Getting Help

1. Check the [API Reference](API_REFERENCE.md) for method signatures and parameters
2. Check the [Shapes Guide](SHAPES.md) for the full shape grammar and field aliasing syntax
3. Check the [Dynamic Models Guide](DYNAMIC_MODELS.md) for internal pipeline details
4. File an issue at [github.com/makegov/tango-node/issues](https://github.com/makegov/tango-node/issues)
5. Email [tango@makegov.com](mailto:tango@makegov.com)

## SDK conformance (maintainers)

The Node SDK tracks both the Tango API contract and the Python SDK's method surface.
The full suite (unit + cassette-replayed integration) plus both conformance gates run in CI on every push and PR (see [CI workflow](../.github/workflows/ci.yml)) and can be run locally.

### Test organization

Tests live under `tests/` in five groups:

| Directory | What it covers | Network |
| --------- | -------------- | ------- |
| `tests/unit/` | Client param mapping, shaping pipeline, iterators, meta diagnostics, error classes, utils — mock responses injected via the `fetchImpl` constructor option | None |
| `tests/integration/` | Per-resource round-trips against **recorded cassettes** (`tests/cassettes/*.json`) — contracts, entities, IDVs, vehicles, opportunities, notices, grants, forecasts, agencies, protests, budget, DIBBS, exclusions, SBIR, reference data, subawards, edge cases | None by default (replay) |
| `tests/production/` | Env-gated live smoke suite — light invariants against the real API | Live, only with `TANGO_LIVE_TESTS=true` |
| `tests/scripts/` | The conformance and shape-coverage gate scripts themselves | None |
| `tests/webhooks/` | `WebhookReceiver`, simulator, and CLI (real local HTTP round-trips) | Loopback only |

### Running tests locally

```bash
npm install
npm test               # watch mode (default vitest behavior)
npm test -- --run      # single-pass, no watch
npm run coverage       # single-pass with v8 coverage report
```

### Integration cassettes (record/replay)

The integration suite is the node equivalent of tango-python's VCR setup: `tests/integration/harness.ts` wraps the SDK's injectable `fetchImpl` and records each interaction as JSON in `tests/cassettes/`.

- **Default runs replay offline.** A missing cassette is a hard failure so drift is loud; an absent cassettes directory (a fork without the corpus) skips the suite with a warning.
- **`TANGO_REFRESH_CASSETTES=true`** re-records serially against the live API (requires `TANGO_API_KEY`). Refresh cassettes and commit them in the same PR as the API change that invalidated them.
- **`TANGO_USE_LIVE_API=true`** bypasses cassettes entirely and hits the live API without writing anything.

```bash
npx vitest run tests/integration                            # replay from committed cassettes
TANGO_REFRESH_CASSETTES=true TANGO_API_KEY=... npx vitest run tests/integration   # re-record
TANGO_USE_LIVE_API=true TANGO_API_KEY=... npx vitest run tests/integration        # live, no recording
```

Cassettes never store request headers (so an API key cannot be serialized), keep only an allowlisted response-header subset, and match on method + path + sorted query, host-insensitive.

### Production smoke suite

`tests/production/smoke.test.ts` asserts light live-API invariants (pagination shape, shaping, rate-limit header parsing).
It only joins the run when `TANGO_LIVE_TESTS=true` **and** `TANGO_API_KEY` are set; `vitest.config.ts` excludes it otherwise, so it never runs in CI.

```bash
TANGO_LIVE_TESTS=true TANGO_API_KEY=... npx vitest run tests/production
```

### Conformance gates

Conformance checking is fully offline: the canonical API filter/shape contract is **vendored** at `contracts/filter_shape_contract.json`, so no token or sibling checkout is needed and forks get the full check.
Two gates run in CI and locally, in opposite directions:

- **`npm run check-conformance`** (`scripts/check-filter-shape-conformance.ts`) — walks each `list*` method's `Options` interface with the TypeScript compiler AST and validates the SDK's filters and shapes against the contract. `TANGO_CONTRACT_PATH` or `--manifest` can point it at a live tango checkout instead.
- **`npm run check-shape-coverage`** (`scripts/check-shape-coverage.ts`) — the reverse gate: fails when Tango's shape trees expose a field or expand the SDK schema doesn't capture and it isn't recorded in `contracts/shape_coverage_baseline.json`.

Accepted gaps live in `contracts/conformance_baseline.json` (missing filters, unimplemented resources) and `contracts/shape_coverage_baseline.json` (shape-coverage backlog).
Baselined gaps report as warnings; anything new is an error.
Shrink the baselines as gaps close — never grow them to silence a legitimate failure.

**`npm run generate-shape-overlay`** (`scripts/generate-shape-overlay.ts`) regenerates `src/shapes/generatedOverlay.ts` — the machine-generated schema additions that close the coverage gaps — from the vendored contract plus `contracts/observed_shape_types.json` (live-API type observations vendored from tango-python).
`SchemaRegistry` merges the overlay over the curated explicit schemas; never edit `generatedOverlay.ts` by hand.

To refresh the vendored contract, copy `contracts/filter_shape_contract.json` from the tango API repo and re-run both gates.
CI also emits a best-effort staleness notice when the vendored contract differs from tango HEAD (token-gated, never a failure).

### Lint and type-check

```bash
npm run lint           # eslint (TypeScript-aware, strict)
npm run typecheck      # tsc --noEmit (no emit, just type errors)
```

### Build

```bash
npm run build          # tsc → dist/
npm run clean          # rm -rf dist
```

### Release workflow

Releases are triggered by creating a GitHub Release (tag + notes). The [publish workflow](../.github/workflows/publish.yml) then:

1. Installs dependencies from the committed lockfile (`npm ci --ignore-scripts`)
2. Lints (`npm run lint`)
3. Tests (`npm test`)
4. Builds (`npm run build`)
5. Publishes to npm with provenance (`npm publish --access public --provenance`)

The `TANGO_NPM_TOKEN` secret must be configured in the repository's GitHub Actions secrets.

To cut a release locally (dry run):

```bash
npm run build
npm pack --dry-run  # inspect what would be published
```

### Smoke scripts (ad hoc, live)

The `scripts/smoke-*.ts` scripts run against a live Tango API instance. These are **not** part of the regular `npm test` suite — they require a valid `TANGO_API_KEY` and (optionally) `TANGO_BASE_URL`.

```bash
# Run with tsx (install globally or via npx)
TANGO_API_KEY=your-key node --import tsx/esm scripts/smoke-reads.ts
TANGO_API_KEY=your-key node --import tsx/esm scripts/smoke-writes.ts
TANGO_API_KEY=your-key node --import tsx/esm scripts/smoke-parity.ts
TANGO_API_KEY=your-key node --import tsx/esm scripts/smoke-extras.ts
```

These scripts hit every client method and report PASS/FAIL per call. Useful when you've changed the client and want to sanity-check against production or a local API instance.
For repeatable coverage of real API responses, prefer the cassette-based integration suite above.

### Repo layout

```
tango-node/
├── src/
│   ├── client.ts           # TangoClient — all API methods
│   ├── config.ts           # ShapeConfig constants + DEFAULT_BASE_URL
│   ├── errors.ts           # TangoAPIError hierarchy + ShapeError hierarchy
│   ├── types.ts            # Shared type definitions
│   ├── index.ts            # Public package entry point
│   ├── models/             # TypeScript interfaces for each resource model
│   │   ├── Contract.ts
│   │   ├── Entity.ts
│   │   ├── IDV.ts
│   │   ├── Vehicle.ts
│   │   ├── Webhooks.ts
│   │   └── ...
│   ├── shapes/             # Dynamic shaping pipeline
│   │   ├── parser.ts       # ShapeParser
│   │   ├── schema.ts       # SchemaRegistry
│   │   ├── generator.ts    # TypeGenerator
│   │   ├── factory.ts      # ModelFactory
│   │   ├── explicitSchemas.ts  # Curated field schema definitions
│   │   ├── generatedOverlay.ts # Machine-generated schema overlay (do not edit)
│   │   └── types.ts        # Internal shape types
│   ├── utils/
│   │   ├── http.ts         # Pagination, query-param helpers
│   │   ├── dates.ts        # Date/datetime parsing
│   │   ├── number.ts       # Decimal normalization
│   │   └── unflatten.ts    # Dot-notation key unflattening
│   └── webhooks/           # Signing, receiver, simulator, CLI
├── contracts/              # Vendored API contract + conformance baselines
├── tests/
│   ├── unit/               # Offline unit tests (fetchImpl mocks)
│   ├── integration/        # Cassette-replayed integration tests + harness.ts
│   ├── cassettes/          # Recorded API interactions (JSON, committed)
│   ├── production/         # Env-gated live smoke suite
│   ├── scripts/            # Tests for the conformance gates
│   └── webhooks/           # Receiver / simulator / CLI tests
├── scripts/                # Conformance gates, overlay generator, live smoke scripts
├── docs/                   # Developer documentation
│   ├── API_REFERENCE.md
│   ├── CLIENT.md           # Client constructor, retries, errors
│   ├── DEVELOPERS.md       # ← this file
│   ├── DYNAMIC_MODELS.md   # Internal pipeline deep-dive
│   ├── SHAPES.md           # Shape grammar + examples
│   └── WEBHOOKS.md         # Receiving + verifying webhook deliveries
├── dist/                   # Compiled output (gitignored)
├── package.json
├── package-lock.json       # Committed — CI installs with `npm ci`
├── tsconfig.json
├── vitest.config.ts
└── eslint.config.js
```

---

**See also:**
- [Shapes Guide](SHAPES.md)
- [API Reference](API_REFERENCE.md)
- [Dynamic Models Guide](DYNAMIC_MODELS.md)
