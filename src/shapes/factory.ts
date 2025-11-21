import { ModelInstantiationError } from "../errors.js";
import { parseDate, parseDateTime } from "../utils/dates.js";
import { parseDecimal } from "../utils/number.js";
import type { ShapeSpec } from "./types.js";
import type { GeneratedField, GeneratedModel } from "./generator.js";
import { TypeGenerator } from "./generator.js";

type AnyRecord = Record<string, unknown>;

export interface ModelFactoryOptions {
  typeGenerator?: TypeGenerator;
}

/**
 * Model factory for creating shaped instances from API responses.
 *
 * This is the Node/TS analogue of tango.shapes.factory.ModelFactory.
 * Instead of creating dynamic dataclass instances, it returns plain
 * JavaScript objects with the correct structure and basic type parsing.
 */
export class ModelFactory {
  private readonly typeGenerator: TypeGenerator;

  constructor(options: ModelFactoryOptions = {}) {
    this.typeGenerator = options.typeGenerator ?? new TypeGenerator();
  }

  /**
   * Create a list of shaped objects from a list response.
   */
  createList(baseModelName: string, shapeSpec: ShapeSpec, rawItems: unknown[]): AnyRecord[] {
    const descriptor = this.typeGenerator.generateModelDescriptor(baseModelName, shapeSpec);
    return rawItems.map((item, index) => this.createOneFromDescriptor(descriptor, item, `index ${index}`));
  }

  /**
   * Create a single shaped object from a detail response.
   */
  createOne(baseModelName: string, shapeSpec: ShapeSpec, rawItem: unknown): AnyRecord {
    const descriptor = this.typeGenerator.generateModelDescriptor(baseModelName, shapeSpec);
    return this.createOneFromDescriptor(descriptor, rawItem, "root");
  }

  private createOneFromDescriptor(model: GeneratedModel, raw: unknown, context: string): AnyRecord {
    if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
      throw new ModelInstantiationError(`Expected object for model "${model.modelName}" at ${context}, got ${typeof raw}`);
    }

    const src = raw as AnyRecord;
    const result: AnyRecord = {};

    for (const field of model.fields) {
      const { field: fieldSchema, alias } = field;
      const sourceKey = fieldSchema.name;

      if (!(sourceKey in src)) {
        // If field is optional, we skip it; otherwise we still skip but do not error,
        // mirroring the Python factory's forgiving behavior for partial payloads.
        continue;
      }

      const rawValue = src[sourceKey];
      const parsed = this.parseFieldValue(field, rawValue, `${context}.${sourceKey}`);
      result[alias] = parsed;
    }

    return result;
  }

  private parseFieldValue(field: GeneratedField, rawValue: unknown, context: string): unknown {
    const { field: fieldSchema, nestedModel } = field;

    const parseScalar = (value: unknown): unknown => {
      if (value === null || value === undefined) {
        return null;
      }

      switch (fieldSchema.type) {
        case "date":
          return parseDate(value);
        case "datetime":
          return parseDateTime(value);
        case "Decimal":
          return parseDecimal(value);
        default:
          return value;
      }
    };

    // Nested model: recurse
    if (nestedModel) {
      if (fieldSchema.isList) {
        if (!Array.isArray(rawValue)) {
          return [];
        }
        return (rawValue as unknown[]).map((item, index) => this.createOneFromDescriptor(nestedModel, item, `${context}[${index}]`));
      }

      if (rawValue === null || rawValue === undefined) {
        return null;
      }

      if (typeof rawValue !== "object" || Array.isArray(rawValue)) {
        throw new ModelInstantiationError(`Expected object for nested field "${fieldSchema.name}" at ${context}`);
      }

      return this.createOneFromDescriptor(nestedModel, rawValue, context);
    }

    // Non-nested field
    if (fieldSchema.isList) {
      if (!Array.isArray(rawValue)) {
        return [];
      }
      return (rawValue as unknown[]).map((item) => parseScalar(item));
    }

    return parseScalar(rawValue);
  }
}
