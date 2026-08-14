# Tango Node SDK – Shaping Guide

A complete translation of the Python SHAPES.md document for Node.

---

## Why Shapes?

Tango resources can have hundreds of fields. Shapes let you request:

- Only what you need
- In nested form
- With aliases
- With wildcards
- With flattening options

---

## Shape Grammar

```
shape       := field_list
field_list  := field ("," field)*
field       := field_name [alias] [nested]
field_name  := identifier | "*"
alias       := "::" identifier
nested      := "(" field_list ")"
identifier  := [a-zA-Z_][a-zA-Z0-9_]*
```

---

## Examples

### Simple

```ts
shape: "key,piid,award_date";
```

### Nested

```ts
shape: "recipient(display_name,uei)";
```

### Aliases

```ts
shape: "recipient::vendor(display_name)";
```

### Wildcard

```ts
shape: "*";
```

### Wildcard nested

```ts
shape: "recipient(*)";
```

---

## ShapeConfig Presets

The SDK ships with a `ShapeConfig` object of ready-made shape strings for common patterns. Import from the main entry point:

```ts
import { TangoClient, ShapeConfig } from "@makegov/tango-node";
```

| Constant                                            | Intended use                |
| --------------------------------------------------- | --------------------------- |
| `ShapeConfig.CONTRACTS_MINIMAL`                     | `listContracts()`           |
| `ShapeConfig.ENTITIES_MINIMAL`                      | `listEntities()`            |
| `ShapeConfig.ENTITIES_COMPREHENSIVE`                | `getEntity()`               |
| `ShapeConfig.FORECASTS_MINIMAL`                     | `listForecasts()`           |
| `ShapeConfig.OPPORTUNITIES_MINIMAL`                 | `listOpportunities()`       |
| `ShapeConfig.NOTICES_MINIMAL`                       | `listNotices()`             |
| `ShapeConfig.PROTESTS_MINIMAL`                      | `listProtests()`            |
| `ShapeConfig.GRANTS_MINIMAL`                        | `listGrants()`              |
| `ShapeConfig.IDVS_MINIMAL`                          | `listIdvs()`                |
| `ShapeConfig.IDVS_COMPREHENSIVE`                    | `getIdv()`                  |
| `ShapeConfig.VEHICLES_MINIMAL`                      | `listVehicles()`            |
| `ShapeConfig.VEHICLES_COMPREHENSIVE`                | `getVehicle()`              |
| `ShapeConfig.VEHICLE_AWARDEES_MINIMAL`              | `listVehicleAwardees()`     |
| `ShapeConfig.VEHICLE_ORDERS_MINIMAL`                | `listVehicleOrders()`       |
| `ShapeConfig.ORGANIZATIONS_MINIMAL`                 | `listOrganizations()`       |
| `ShapeConfig.OTAS_MINIMAL`                          | `listOtas()`                |
| `ShapeConfig.OTIDVS_MINIMAL`                        | `listOtidvs()`              |
| `ShapeConfig.SUBAWARDS_MINIMAL`                     | `listSubawards()`           |
| `ShapeConfig.GSA_ELIBRARY_CONTRACTS_MINIMAL`        | `listGsaElibraryContracts()` / `getGsaElibraryContract()` |
| `ShapeConfig.ITDASHBOARD_INVESTMENTS_MINIMAL`       | `listItDashboard()`         |
| `ShapeConfig.ITDASHBOARD_INVESTMENTS_COMPREHENSIVE` | `getItDashboard()`          |
| `ShapeConfig.DIBBS_RFQS_MINIMAL`                    | `listDibbsRfqs()`           |
| `ShapeConfig.DIBBS_RFPS_MINIMAL`                    | `listDibbsRfps()`           |
| `ShapeConfig.DIBBS_AWARDS_MINIMAL`                  | `listDibbsAwards()`         |
| `ShapeConfig.EXCLUSIONS_MINIMAL`                    | `listExclusions()`          |
| `ShapeConfig.SBIR_TOPICS_MINIMAL`                   | `listSbirTopics()`          |
| `ShapeConfig.SBIR_SOLICITATIONS_MINIMAL`            | `listSbirSolicitations()`   |

These are plain strings — you can use them directly or as a starting point:

```ts
const contracts = await client.listContracts({
  shape: ShapeConfig.CONTRACTS_MINIMAL,
  limit: 10,
});
```

---

## Flat Responses

```ts
shape: ShapeConfig.CONTRACTS_MINIMAL,
flat: true
```

When `flat: true` is passed, the Tango API returns dotted key names instead of nested objects. The SDK automatically unflattens them back into nested objects on the client side:

```ts
// API returns:       { "recipient.display_name": "Acme" }
// SDK unflattens to: { recipient: { display_name: "Acme" } }
```

You can override the separator character (default `"."`) with the `joiner` option.

---

## Validation

ShapeParser enforces syntax.

TypeGenerator enforces semantic model rules (existence of fields, nested models).

---

## Performance Tips

- Use minimal shapes in production.
- Avoid full-wildcard unless you need all fields.
- Prefer shallow nested shapes for large nested structures.
