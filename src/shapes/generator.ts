import { ShapeValidationError } from "../errors.js";
import type { FieldSchema } from "./schemaTypes.js";
import { SchemaRegistry } from "./schema.js";
import type { FieldSpec } from "./types.js";
import { ShapeSpec } from "./types.js";

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
        const fieldSchema = this.schemaRegistry.getField(modelName, fieldSpec.name);
        fields.push(this.buildGeneratedField(fieldSpec.name, fieldSpec, fieldSchema));
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
      const nestedModelName =
        fieldSchema.nestedModel && typeof fieldSchema.nestedModel === "string" && fieldSchema.nestedModel.trim() !== ""
          ? fieldSchema.nestedModel
          : this.inferNestedModelName(fieldSchema);

      if (!nestedModelName) {
        throw new ShapeValidationError(
          `Field "${requestedName}" on model "${fieldSchema.name}" does not support nested fields.`,
        );
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
