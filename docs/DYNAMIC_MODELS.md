# Tango Node SDK – Dynamic Models Guide

This document explains how the **Node.js dynamic shaping system** works.
It is a full translation of the Python `DEVELOPERS.md` shaping guide.

---

# Overview

Tango’s dynamic modeling allows you to:

- Request _exactly the fields you want_
- Validate the shape string against Tango’s schemas
- Generate a typed model descriptor at runtime
- Materialize shaped objects using correct:
  - date parsing
  - datetime parsing
  - decimal handling
  - list vs scalar logic
  - nested structure

---

# Components

## ShapeParser

Parses shape strings into a `ShapeSpec`.

```ts
import { ShapeParser } from "@makegov/tango-node/shapes";

const parser = new ShapeParser();
const spec = parser.parse("key,piid,recipient(display_name)");
```

## SchemaRegistry

Holds the field schemas for all models.

```ts
import { SchemaRegistry } from "@makegov/tango-node/shapes";

const registry = new SchemaRegistry();
registry.getField("Contract", "award_date");
```

## TypeGenerator

Builds a `GeneratedModel` descriptor from `(baseModel, shapeSpec)`.

```ts
import { TypeGenerator } from "@makegov/tango-node/shapes";

const gen = new TypeGenerator();
const model = gen.generateModelDescriptor("Contract", spec);
```

## ModelFactory

Takes a descriptor + raw API JSON and produces typed shaped objects.

```ts
import { ModelFactory } from "@makegov/tango-node/shapes";

const factory = new ModelFactory();
const shaped = factory.createOne("Contract", spec, rawRecord);
```

---

# Example: Full Shaping Pipeline

```ts
const parser = new ShapeParser();
const spec = parser.parse("key,award_date,recipient(display_name)");

const gen = new TypeGenerator();
const descriptor = gen.generateModelDescriptor("Contract", spec);

const factory = new ModelFactory();
const shaped = factory.createOne("Contract", spec, {
  key: "C-1",
  award_date: "2024-01-15",
  recipient: { display_name: "Acme" },
});
```

`shaped` becomes:

```ts
{
  key: "C-1",
  award_date: Date("2024-01-15"),
  recipient: { display_name: "Acme" }
}
```

---

# Type Safety

Node SDK cannot generate TypeScript interfaces at runtime, but it _does_
enforce shape correctness at runtime and guarantees nested structures.

Future versions may include codegen for shape-derived TypeScript interfaces.

---

# Caching

TypeGenerator caches descriptors with FIFO eviction.

ShapeParser also caches parse results.

---

# Nested Models

If a field is nested in the schema (e.g. `"recipient"` → `RecipientProfile`),
the generator recursively builds the nested descriptor.

---
