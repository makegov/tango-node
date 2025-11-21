export interface FieldSpec {
  /**
   * Field name (e.g. "key", "piid", "recipient").
   * The special name "*" indicates a wildcard selection.
   */
  name: string;

  /**
   * Optional alias for this field in the shaped response.
   */
  alias?: string | null;

  /**
   * Nested field specifications for nested objects.
   */
  nestedFields?: FieldSpec[];

  /**
   * Whether this field represents a wildcard selection.
   */
  isWildcard?: boolean;
}

export interface ShapeSpecOptions {
  /**
   * Whether the server should return flat (dotted) keys.
   */
  isFlat?: boolean;

  /**
   * Whether list fields should be flattened.
   */
  isFlatLists?: boolean;
}

/**
 * Parsed representation of a Tango shape string.
 *
 * This mirrors the Python ShapeSpec class and is used to drive both
 * schema validation and dynamic model generation.
 */
export class ShapeSpec {
  readonly fields: FieldSpec[];
  readonly isFlat: boolean;
  readonly isFlatLists: boolean;

  constructor(fields: FieldSpec[], options: ShapeSpecOptions = {}) {
    this.fields = fields;
    this.isFlat = options.isFlat ?? false;
    this.isFlatLists = options.isFlatLists ?? false;
  }

  /**
   * Build a stable cache key for this shape when used with a base model.
   */
  getCacheKey(baseModelName: string): string {
    const payload = {
      fields: this.fields,
      isFlat: this.isFlat,
      isFlatLists: this.isFlatLists,
    };
    return `${baseModelName}:${JSON.stringify(payload)}`;
  }
}
