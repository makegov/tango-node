# Tango Node SDK – API Reference

This document provides the full API reference for the **Node.js / TypeScript**
version of the Tango SDK. It is a translation of the Python SDK documentation,
rewritten for JavaScript runtime semantics, async/await, and the TypeScript
type system.

## Importing

```ts
import { TangoClient, ShapeConfig } from "@makegov/tango-node";
```

All methods are async and return Promises.

---

# Agencies

## `listAgencies(options?)`

List federal departments and subagencies.

```ts
const resp = await client.listAgencies({ page: 1, limit: 25 });
```

### Parameters

| Name    | Type     | Description                                 |
| ------- | -------- | ------------------------------------------- |
| `page`  | `number` | Page number (default 1).                    |
| `limit` | `number` | Max results per page (default 25, max 100). |

### Returns

`PaginatedResponse<AgencyLike>`

---

## `getAgency(code)`

Fetch a single agency by its code.

```ts
const agency = await client.getAgency("2000");
```

Returns a plain object containing the full agency record as defined by the schema.

---

# Business Types

## `listBusinessTypes(options?)`

Lists SBA/USASpending business type entries.

```ts
const types = await client.listBusinessTypes();
```

---

# Contracts

## `listContracts(options)`

Search and list contract records.

```ts
const resp = await client.listContracts({
  keyword: "cloud",
  naics_code: "541511",
  shape: ShapeConfig.CONTRACTS_MINIMAL,
  flat: true,
});
```

### Search / Filter Parameters

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

### Returns

`PaginatedResponse<ContractShaped>`

Where ContractShaped depends on the shape string used.

---

# Entities

## `listEntities(options)`

```ts
const resp = await client.listEntities({
  search: "Acme",
  shape: ShapeConfig.ENTITIES_MINIMAL,
});
```

Filters:

- `search`
- any field names supported by the API

## `getEntity(uei, options?)`

Fetch a single entity by UEI or CAGE.

Returns a shaped entity object.

---

# Forecasts

## `listForecasts(options)`

Forecast search, with optional shaping.

---

# Opportunities

## `listOpportunities(options)`

Search SAM.gov opportunities with shaping.

---

# Notices

## `listNotices(options)`

---

# Grants

## `listGrants(options)`

---

# Error Types

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

# Pagination

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
