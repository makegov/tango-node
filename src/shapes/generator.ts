import { ShapeValidationError } from "../errors.js";
import type { FieldSchema } from "./schemaTypes.js";
import { SchemaRegistry } from "./schema.js";
import type { FieldSpec } from "./types.js";
import { ShapeSpec } from "./types.js";

/**
 * Global expand-name aliases. Mirrors ``_EXPAND_ALIASES`` in the server
 * (`tango/src/api/shaping/grammar.py`). Aliasing only applies when the
 * source name is used as an *expand* (has a nested child group); bare
 * scalar leaves like ``naics_code`` / ``psc_code`` are left untouched
 * and continue to return the raw column value.
 *
 * Keep this list short — aliases are intended for well-known historical
 * spellings, not for fixing one-off naming inconsistencies. See
 * makegov/tango#2257 and makegov/tango#2265.
 */
export const EXPAND_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  naics_code: "naics",
  psc_code: "psc",
});

/**
 * If ``spec.name`` is an expand alias (e.g. ``naics_code``) AND the spec
 * has nested fields, rewrite it to the canonical name (``naics``). The
 * caller's alias (``::alias``) is preserved as-is, mirroring the server.
 *
 * Returns the original spec when no rewrite applies.
 */
function normalizeExpandAlias(spec: FieldSpec): FieldSpec {
  const hasNested = Array.isArray(spec.nestedFields) && spec.nestedFields.length > 0;
  if (!hasNested) {
    return spec;
  }
  const canonical = EXPAND_ALIASES[spec.name];
  if (!canonical) {
    return spec;
  }
  return { ...spec, name: canonical };
}

export interface GeneratedField {
  field: FieldSchema;
  spec: FieldSpec;
  /**
   * Alias to use in the shaped output (defaults to field.name).
   */
  alias: string;
  /**
   * Nested generated model for nested objects, if any.
   */
  nestedModel?: GeneratedModel | null;
}

export interface GeneratedModel {
  modelName: string;
  fields: GeneratedField[];
  isFlat: boolean;
  isFlatLists: boolean;
}

export interface TypeGeneratorOptions {
  cacheEnabled?: boolean;
  cacheSize?: number;
  schemaRegistry?: SchemaRegistry;
}

/**
 * Generate runtime descriptors for shaped models based on ShapeSpec and the schema registry.
 *
 * This is the Node/TS analogue of tango.shapes.generator.TypeGenerator. Instead of creating
 * TypedDict classes, it produces plain descriptors that the ModelFactory can use to construct
 * shaped objects.
 */
export class TypeGenerator {
  private readonly cacheEnabled: boolean;
  private readonly cacheSize: number;
  private readonly cache: Map<string, GeneratedModel>;
  private readonly schemaRegistry: SchemaRegistry;

  constructor(options: TypeGeneratorOptions = {}) {
    this.cacheEnabled = options.cacheEnabled ?? true;
    this.cacheSize = options.cacheSize ?? 128;
    this.cache = new Map();
    this.schemaRegistry = options.schemaRegistry ?? new SchemaRegistry();
  }

  /**
   * Generate (or retrieve from cache) a model descriptor for the given base model and shape.
   */
  generateModelDescriptor(baseModelName: string, shapeSpec: ShapeSpec): GeneratedModel {
    const cacheKey = shapeSpec.getCacheKey(baseModelName);

    if (this.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const model = this.buildModelDescriptor(baseModelName, shapeSpec);

    if (this.cacheEnabled) {
      if (!this.cache.has(cacheKey)) {
        this.cache.set(cacheKey, model);
        if (this.cache.size > this.cacheSize) {
          // Simple FIFO eviction
          const firstKey = this.cache.keys().next().value;
          if (firstKey) {
            this.cache.delete(firstKey);
          }
        }
      }
    }

    return model;
  }

  private buildModelDescriptor(modelName: string, shapeSpec: ShapeSpec): GeneratedModel {
    const schema = this.schemaRegistry.getSchema(modelName);
    const fields: GeneratedField[] = [];

    for (const fieldSpec of shapeSpec.fields) {
      if (fieldSpec.name === "*" || fieldSpec.isWildcard) {
        // Wildcard at this level: expand all fields
        for (const [fieldName, fieldSchema] of Object.entries(schema.fields)) {
          fields.push(this.buildGeneratedField(fieldName, fieldSpec, fieldSchema));
        }
      } else {
        const normalizedSpec = normalizeExpandAlias(fieldSpec);
        const fieldSchema = this.schemaRegistry.getField(modelName, normalizedSpec.name);
        fields.push(this.buildGeneratedField(normalizedSpec.name, normalizedSpec, fieldSchema));
      }
    }

    // Deduplicate by alias (later fields win, mirroring Python behavior)
    const byAlias = new Map<string, GeneratedField>();
    for (const f of fields) {
      byAlias.set(f.alias, f);
    }

    return {
      modelName,
      fields: Array.from(byAlias.values()),
      isFlat: shapeSpec.isFlat,
      isFlatLists: shapeSpec.isFlatLists,
    };
  }

  private buildGeneratedField(requestedName: string, spec: FieldSpec, fieldSchema: FieldSchema): GeneratedField {
    const alias = spec.alias ?? fieldSchema.name;

    let nestedModel: GeneratedModel | null = null;

    if (spec.nestedFields && spec.nestedFields.length > 0) {
      // Wildcard-only expansion (e.g., `federal_obligations(*)`) means "return
      // the whole nested object as-is" — no field projection. For schema-less
      // dict fields, this is the only valid expansion. Mirrors Python (which
      // treats `field(*)` as `is_wildcard=True` with no nested_fields and
      // skips the nested-model check entirely).
      const isWildcardOnly =
        spec.nestedFields.length === 1 &&
        (spec.nestedFields[0].isWildcard || spec.nestedFields[0].name === "*");

      const nestedModelName =
        fieldSchema.nestedModel && typeof fieldSchema.nestedModel === "string" && fieldSchema.nestedModel.trim() !== ""
          ? fieldSchema.nestedModel
          : this.inferNestedModelName(fieldSchema);

      if (!nestedModelName) {
        if (isWildcardOnly) {
          // Pass-through: no nested model needed for a pure wildcard.
          return {
            field: fieldSchema,
            spec: { ...spec, isWildcard: true, nestedFields: undefined },
            alias,
            nestedModel: null,
          };
        }
        throw new ShapeValidationError(`Field "${requestedName}" on model "${fieldSchema.name}" does not support nested fields.`);
      }

      const nestedShapeFields = this.normalizeNestedShapeFields(spec.nestedFields);
      const nestedShape = new ShapeSpec(nestedShapeFields, {
        isFlat: false,
        isFlatLists: false,
      });

      nestedModel = this.buildModelDescriptor(nestedModelName, nestedShape);
    }

    return {
      field: fieldSchema,
      spec,
      alias,
      nestedModel,
    };
  }

  private inferNestedModelName(fieldSchema: FieldSchema): string | null {
    const primitiveTypes = new Set(["str", "int", "float", "bool", "Decimal", "date", "datetime", "dict", "Any"]);

    if (!primitiveTypes.has(fieldSchema.type)) {
      return fieldSchema.type;
    }

    return null;
  }

  /**
   * Normalize nested shape fields, handling wildcard nested selection like recipient(*).
   */
  private normalizeNestedShapeFields(nested: FieldSpec[]): FieldSpec[] {
    if (nested.length === 1) {
      const only = nested[0];
      if (only.name === "*" || only.isWildcard) {
        // A pure wildcard nested selection – leave as-is and let buildModelDescriptor
        // expand it for the nested model.
        return [{ name: "*", isWildcard: true }];
      }
    }
    return nested;
  }
}
