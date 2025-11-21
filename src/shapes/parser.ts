import { ShapeParseError } from "../errors.js";
import type { FieldSpec } from "./types.js";
import { ShapeSpec } from "./types.js";

function isIdentifierStart(ch: string): boolean {
  return /[a-zA-Z_]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[a-zA-Z0-9_]/.test(ch);
}

/**
 * Shape string parser for Tango SDK (Node/TS port).
 *
 * Grammar (same as Python SDK):
 *   shape       := field_list
 *   field_list  := field ("," field)*
 *   field       := field_name [alias] [nested]
 *   field_name  := identifier | "*"
 *   alias       := "::" identifier
 *   nested      := "(" field_list ")"
 *   identifier  := [a-zA-Z_][a-zA-Z0-9_]*
 */
export class ShapeParser {
  private readonly cacheEnabled: boolean;
  private readonly parseCache: Map<string, ShapeSpec>;

  constructor(options: { cacheEnabled?: boolean } = {}) {
    this.cacheEnabled = options.cacheEnabled ?? true;
    this.parseCache = new Map();
  }

  /**
   * Parse a shape string into a ShapeSpec.
   */
  parse(shape: string): ShapeSpec {
    const input = shape.trim();
    if (!input) {
      throw new ShapeParseError("Shape string cannot be empty");
    }

    if (this.cacheEnabled && this.parseCache.has(input)) {
      return this.parseCache.get(input)!;
    }

    const [fields, pos] = this.parseFieldList(input, 0);

    // Skip trailing whitespace
    let cursor = pos;
    while (cursor < input.length && input[cursor].trim() === "") {
      cursor += 1;
    }

    if (cursor < input.length) {
      const ch = input[cursor];
      throw new ShapeParseError(
        `Unexpected character "${ch}" at position ${cursor}`,
      );
    }

    const spec = new ShapeSpec(fields);

    if (this.cacheEnabled) {
      this.parseCache.set(input, spec);
    }

    return spec;
  }

  /**
   * Parse a shape string and attach flat/flat_lists flags.
   */
  parseWithFlags(shape: string, isFlat: boolean, isFlatLists: boolean): ShapeSpec {
    const spec = this.parse(shape);
    return new ShapeSpec(spec.fields, { isFlat, isFlatLists });
  }

  /**
   * Validate syntax only (used for quick checks).
   */
  validateSyntax(shape: string): void {
    // Parsing already performs syntax validation; we discard the result.
    this.parse(shape);
  }

  private parseFieldList(input: string, startPos: number): [FieldSpec[], number] {
    const fields: FieldSpec[] = [];
    let pos = startPos;
    let expectField = true;

    while (pos < input.length) {
      // Skip whitespace
      while (pos < input.length && input[pos].trim() === "") {
        pos += 1;
      }

      if (pos >= input.length) {
        break;
      }

      const ch = input[pos];

      if (ch === ",") {
        if (expectField) {
          throw new ShapeParseError(
            `Expected field before comma at position ${pos}`,
          );
        }
        expectField = true;
        pos += 1;
        continue;
      }

      if (ch === ")") {
        // Caller is responsible for consuming ')'
        break;
      }

      // Parse a single field
      const [field, nextPos] = this.parseField(input, pos);
      fields.push(field);
      pos = nextPos;
      expectField = false;
    }

    if (expectField && fields.length > 0) {
      throw new ShapeParseError(
        "Expected field after comma but reached end of shape string",
      );
    }

    return [fields, pos];
  }

  private parseField(input: string, startPos: number): [FieldSpec, number] {
    let pos = startPos;

    // Skip whitespace
    while (pos < input.length && input[pos].trim() === "") {
      pos += 1;
    }

    if (pos >= input.length) {
      throw new ShapeParseError("Unexpected end of shape while parsing field");
    }

    let name: string;
    let isWildcard = false;

    if (input[pos] === "*") {
      name = "*";
      isWildcard = true;
      pos += 1;
    } else {
      [name, pos] = this.parseIdentifier(input, pos);
    }

    let alias: string | null = null;
    let nestedFields: FieldSpec[] | undefined;

    // Parse optional alias
    if (input.slice(pos, pos + 2) === "::") {
      if (isWildcard) {
        throw new ShapeParseError(
          "Wildcard fields cannot have aliases (\"*::alias\" is invalid)",
        );
      }
      pos += 2;
      [alias, pos] = this.parseIdentifier(input, pos);
    }

    // Skip whitespace
    while (pos < input.length && input[pos].trim() === "") {
      pos += 1;
    }

    // Parse optional nested field list
    if (pos < input.length && input[pos] === "(") {
      pos += 1;
      const [nested, nextPos] = this.parseFieldList(input, pos);
      pos = nextPos;

      // Skip whitespace before ')'
      while (pos < input.length && input[pos].trim() === "") {
        pos += 1;
      }

      if (pos >= input.length || input[pos] !== ")") {
        throw new ShapeParseError(
          `Expected ')' to close nested field list for "${name}"`,
        );
      }
      pos += 1;
      nestedFields = nested;
    }

    const fieldSpec: FieldSpec = { name, alias, nestedFields, isWildcard };
    return [fieldSpec, pos];
  }

  private parseIdentifier(input: string, startPos: number): [string, number] {
    let pos = startPos;
    const first = input[pos];

    if (!isIdentifierStart(first)) {
      throw new ShapeParseError(
        `Invalid identifier start '${first}' at position ${pos}`,
      );
    }

    let ident = first;
    pos += 1;

    while (pos < input.length && isIdentifierPart(input[pos])) {
      ident += input[pos];
      pos += 1;
    }

    return [ident, pos];
  }
}
