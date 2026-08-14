import { ShapeValidationError } from "../errors.js";
import type { FieldSchema, FieldSchemaMap } from "./schemaTypes.js";
import { EXPLICIT_SCHEMAS } from "./explicitSchemas.js";
import { GENERATED_NESTED, GENERATED_OVERLAY } from "./generatedOverlay.js";

export interface ModelSchema {
  modelName: string;
  fields: FieldSchemaMap;
}

/**
 * Registry of model schemas for validation and type inference.
 *
 * This mirrors tango.shapes.schema.SchemaRegistry in the Python SDK, but
 * is simplified for the Node/TypeScript environment.
 */
export class SchemaRegistry {
  private readonly schemas: Map<string, ModelSchema> = new Map();
  private explicitRegistered = false;

  constructor() {
    this.ensureExplicitSchemas();
  }

  private ensureExplicitSchemas(): void {
    if (this.explicitRegistered) return;

    const entries: [string, FieldSchemaMap][] = Object.entries(EXPLICIT_SCHEMAS);
    for (const [modelName, fields] of entries) {
      this.schemas.set(modelName, { modelName, fields });
    }

    // Merge the generated reverse-coverage overlay (scripts/generate-shape-overlay.ts):
    // the fields and expands Tango's shape trees expose that the curated schemas above
    // missed. Spread into a fresh object so the module-level schema maps stay unmutated.
    for (const [refName, fields] of Object.entries(GENERATED_NESTED)) {
      const existing = this.schemas.get(refName)?.fields ?? {};
      this.schemas.set(refName, { modelName: refName, fields: { ...existing, ...fields } });
    }
    for (const [modelName, additions] of Object.entries(GENERATED_OVERLAY)) {
      const existing = this.schemas.get(modelName)?.fields ?? {};
      this.schemas.set(modelName, { modelName, fields: { ...existing, ...additions } });
    }

    this.explicitRegistered = true;
  }

  /**
   * Get the schema for a model by name.
   */
  getSchema(modelName: string): ModelSchema {
    this.ensureExplicitSchemas();
    const schema = this.schemas.get(modelName);
    if (!schema) {
      throw new ShapeValidationError(`Unknown model: ${modelName}`);
    }
    return schema;
  }

  /**
   * Get the schema for a specific field on a model.
   */
  getField(modelName: string, fieldName: string): FieldSchema {
    const schema = this.getSchema(modelName);
    const field = schema.fields[fieldName];
    if (!field) {
      const available = Object.keys(schema.fields).sort();
      let msg = `Field "${fieldName}" does not exist on model "${modelName}".`;
      if (available.length) {
        const shown = available.slice(0, 20);
        msg += ` Available fields: ${shown.join(", ")}`;
        if (available.length > shown.length) {
          msg += `, ... (${available.length - shown.length} more)`;
        }
      }
      throw new ShapeValidationError(msg);
    }
    return field;
  }

  /**
   * List all field names for a model.
   */
  listFieldNames(modelName: string): string[] {
    const schema = this.getSchema(modelName);
    return Object.keys(schema.fields).sort();
  }
}
