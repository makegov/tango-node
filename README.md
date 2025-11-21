# Tango Node SDK

A modern Node.js SDK for the [Tango API](https://tango.makegov.com), featuring dynamic response shaping, strong TypeScript types, and full coverage of the core Tango endpoints.

> This is the Node/TypeScript port of the official Tango Python SDK.

## Features

- **Dynamic Response Shaping** – Ask Tango for exactly the fields you want using a simple shape syntax.
- **Type-Safe by Design** – Shape strings are validated against Tango schemas and mapped to generated TypeScript types.
- **Comprehensive API Coverage** – Agencies, business types, entities, contracts, forecasts, opportunities, notices, and grants.
- **Flexible Data Access** – Plain JavaScript objects backed by runtime validation and parsing.
- **Modern Node** – Built for Node 18+ with native `fetch` and ESM-first design.
- **Tested Against the Real API** – Integration tests (mirroring the Python SDK) keep behavior aligned.

## Installation

**Requirements:** Node 18 or higher.

```bash
npm install @makegov/tango-node
# or
yarn add @makegov/tango-node
# or
pnpm add @makegov/tango-node
```

## Quick Start

### Initialize the client

```ts
import { TangoClient } from "@makegov/tango-node";

const client = new TangoClient({
  apiKey: process.env.TANGO_API_KEY,
  // baseUrl: "https://tango.makegov.com", // default
});
```

### List agencies

```ts
const agencies = await client.listAgencies();

for (const agency of agencies.results) {
  console.log(agency.code, agency.name);
}
```

### Get a specific agency

```ts
const treasury = await client.getAgency("2000"); // Treasury
console.log(treasury.name, treasury.department?.name);
```

### Search contracts with a minimal shape

```ts
import { TangoClient, ShapeConfig } from "@makegov/tango-node";

const client = new TangoClient({ apiKey: process.env.TANGO_API_KEY });

const contracts = await client.listContracts({
  shape: ShapeConfig.CONTRACTS_MINIMAL,
  keyword: "cloud services",
  awarding_agency: "4700",
  fiscal_year: 2024,
  limit: 10,
});

// Each contract is shaped according to CONTRACTS_MINIMAL
for (const c of contracts.results) {
  console.log(c.piid, c.award_date, c.recipient.display_name);
}
```

### Get a fully-shaped entity

```ts
import { TangoClient, ShapeConfig } from "@makegov/tango-node";

const client = new TangoClient({ apiKey: process.env.TANGO_API_KEY });

const entity = await client.getEntity("ABC123DEF456", {
  shape: ShapeConfig.ENTITIES_COMPREHENSIVE,
});

console.log(entity.uei, entity.legal_business_name, entity.primary_naics);
```

## Authentication

The Node SDK uses the same model as the Python one: you can either pass the API key directly or read it from `TANGO_API_KEY`.

### With API key

```ts
import { TangoClient } from "@makegov/tango-node";

const client = new TangoClient({
  apiKey: "your-api-key-here",
});
```

### From environment variable (`TANGO_API_KEY`)

```ts
import { TangoClient } from "@makegov/tango-node";

const client = new TangoClient();
// If apiKey is omitted, the client will look for process.env.TANGO_API_KEY
```

## Core Concepts

### Dynamic Response Shaping

Response shaping is the core feature of Tango. Instead of always receiving huge objects with every field, you describe the fields you want with a compact shape string:

```ts
const contracts = await client.listContracts({
  shape: "key,piid,award_date,recipient(display_name),total_contract_value",
  keyword: "software",
  limit: 5,
});
```

**Shapes:**

- Reduce payload size (often massively).
- Keep responses focused on what your app actually uses.
- Drive type safety – the SDK maps the shape to a TypeScript type.

**The Node SDK includes:**

- A **shape parser** that validates shape strings.
- A **schema registry** that knows what fields exist on each resource.
- A **type generator** and **model factory** that convert raw API JSON into strongly-typed objects.

### Flat vs nested responses

By default, nested fields are returned as nested objects:

```ts
// shape:
"key,piid,recipient(display_name,uei)";

//
contract.recipient.display_name;
contract.recipient.uei;
```

You can request a "flat" representation that uses dotted keys and then unflattens into nested objects on the client:

```ts
const contracts = await client.listContracts({
  shape: ShapeConfig.CONTRACTS_MINIMAL,
  flat: true,
});
```

The Node SDK mirrors the Python client's behavior for `shape`, `flat`, and `flat_lists`.

## API Methods

The Node client mirrors the Python SDK's high-level API:

- `listAgencies(options)`
- `getAgency(code)`
- `listBusinessTypes(options)`
- `listContracts(options)`
- `listEntities(options)`
- `getEntity(ueiOrCage, options)`
- `listForecasts(options)`
- `listOpportunities(options)`
- `listNotices(options)`
- `listGrants(options)`

All list methods return a paginated response:

```ts
interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  pageMetadata: Record<string, unknown> | null;
  results: T[];
}
```

## Error Handling

Errors are surfaced as typed exceptions, aligned with the Python SDK:

- `TangoAPIError` – Base error for unexpected issues.
- `TangoAuthError` – Authentication problems (e.g., invalid API key, 401).
- `TangoNotFoundError` – Resource not found (404).
- `TangoValidationError` – Invalid request parameters (400).
- `TangoRateLimitError` – Rate limit exceeded (429).

Shape-related errors:

- `ShapeError`
- `ShapeValidationError`
- `ShapeParseError`
- `TypeGenerationError`
- `ModelInstantiationError`

Use them in your code:

```ts
import { TangoClient, TangoAPIError, TangoValidationError } from "@makegov/tango-node";

try {
  const resp = await client.listContracts({ keyword: "cloud", limit: 5 });
} catch (err) {
  if (err instanceof TangoValidationError) {
    console.error("Bad request:", err.message);
  } else if (err instanceof TangoAPIError) {
    console.error("Tango API error:", err.message);
  } else {
    console.error("Unexpected error:", err);
  }
}
```

## Project Structure

```text
tango-node/
├── src/                         # Source TypeScript
│   ├── client.ts                # TangoClient implementation
│   ├── config.ts                # Default base URL + shape presets
│   ├── errors.ts                # Error classes (API, auth, validation, etc.)
│   ├── index.ts                 # Public API exports
│   ├── types.ts                 # Shared types (options, PaginatedResponse)
│   ├── shapes/                  # Shape system (parser, generator, factory)
│   │   ├── explicitSchemas.ts   # Predefined schemas for resources
│   │   ├── factory.ts           # Instantiate typed models from data
│   │   ├── generator.ts         # Type generation from shape specs
│   │   ├── index.ts             # Shapes exports
│   │   ├── parser.ts            # Shape string parser
│   │   ├── schema.ts            # Schema registry + validation
│   │   ├── schemaTypes.ts       # Schema data structures
│   │   └── types.ts             # Shape spec types
│   └── utils/                   # Helpers
│       ├── dates.ts             # Date/time parsing utilities
│       ├── http.ts              # HTTP client wrapper
│       ├── number.ts            # Numeric parsing/formatting
│       └── unflatten.ts         # Unflatten dotted-key responses
├── tests/                       # Test suite (Vitest)
│   └── unit/
│       ├── client.test.ts
│       ├── errors.test.ts
│       ├── shapes.factory.test.ts
│       ├── shapes.generator.test.ts
│       ├── shapes.parser.test.ts
│       ├── shapes.schema.test.ts
│       ├── utils.dates.test.ts
│       ├── utils.http.test.ts
│       ├── utils.number.test.ts
│       └── utils.unflatten.test.ts
├── dist/                        # Build output (compiled JS + d.ts) from `npm run build`
├── package.json                 # Package metadata/scripts
├── tsconfig.json                # TypeScript config
├── README.md                    # Usage docs
├── CHANGELOG.md                 # Version history
├── ROADMAP.md                   # Planned work
└── LICENSE                      # MIT license
```

## Development

After cloning the repo:

```bash
npm install
npm run build
npm test
```

Useful scripts:

- `npm run build` – Compile TypeScript to `dist/`.
- `npm test` – Run unit and integration tests.
- `npm run lint` – Run ESLint.
- `npm run format` – Run Prettier.
- `npm run typecheck` – TS type checking without emit.

## Requirements

- Node 18 or higher.
- A valid [Tango API key](https://tango.makegov.com/).

## License

MIT License - see [LICENSE](LICENSE) for details.

## Support

For questions, issues, or feature requests:

- **Email**: [tango@makegov.com](mailto:tango@makegov.com)
- **Issues**: [GitHub Issues](https://github.com/makegov/tango-node/issues)
- **Documentation**: [https://tango.makegov.com/docs/tango-node](https://tango.makegov.com/docs/tango-node)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm run test`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request
