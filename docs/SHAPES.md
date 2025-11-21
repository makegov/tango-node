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

## Flat Responses

```ts
shape: ShapeConfig.CONTRACTS_MINIMAL,
flat: true
```

The Tango API returns dotted keys; the SDK unflattens them:

```ts
recipient.display_name → recipient.display_name
```

---

## Validation

ShapeParser enforces syntax.

TypeGenerator enforces semantic model rules (existence of fields, nested models).

---

## Performance Tips

- Use minimal shapes in production.
- Avoid full-wildcard unless you need all fields.
- Prefer shallow nested shapes for large nested structures.
