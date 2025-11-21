/**
 * Schema information for a single model field.
 *
 * This mirrors tango.shapes.schema.FieldSchema in the Python SDK.
 */
export interface FieldSchema {
  /**
   * Field name as exposed in the API payload and shape strings.
   */
  name: string;

  /**
   * Logical type name.
   *
   * For built-in types this will be values like:
   *   - "str", "int", "float", "bool", "Decimal"
   *   - "date", "datetime", "dict", "Any"
   *
   * For nested models this will be the model name, e.g. "Agency", "Location".
   */
  type: string;

  /**
   * Whether the field is optional (can be null / missing).
   */
  isOptional: boolean;

  /**
   * Whether the field is a list type.
   */
  isList: boolean;

  /**
   * Name of the nested model for nested objects, if any.
   */
  nestedModel?: string | null;
}

/**
 * Map of field name -> schema information.
 */
export type FieldSchemaMap = Record<string, FieldSchema>;

/**
 * Map of model name -> field schema map.
 */
export type ExplicitSchemas = Record<string, FieldSchemaMap>;
