import { isRecord } from "./utils/guards.js";

export class TangoAPIError extends Error {
  readonly statusCode?: number;
  readonly responseData?: unknown;

  constructor(message: string, statusCode?: number, responseData?: unknown) {
    super(message);
    this.name = "TangoAPIError";
    this.statusCode = statusCode;
    this.responseData = responseData;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class TangoAuthError extends TangoAPIError {
  constructor(message = "Authentication error", statusCode?: number, responseData?: unknown) {
    super(message, statusCode, responseData);
    this.name = "TangoAuthError";
  }
}

export class TangoNotFoundError extends TangoAPIError {
  constructor(message = "Resource not found", statusCode?: number, responseData?: unknown) {
    super(message, statusCode, responseData);
    this.name = "TangoNotFoundError";
  }
}

export class TangoValidationError extends TangoAPIError {
  constructor(message = "Invalid request parameters", statusCode?: number, responseData?: unknown) {
    super(message, statusCode, responseData);
    this.name = "TangoValidationError";
  }

  /**
   * Structured validation issues from the API response.
   * For shape errors the API returns entries like `{"path": "tradeoff_process", "reason": "unknown_field"}`.
   * Empty array when the response carried no structured issues.
   */
  get issues(): Array<Record<string, unknown>> {
    const data = this.responseData;
    if (!isRecord(data)) return [];
    const val = data.issues;
    if (!Array.isArray(val)) return [];
    return val.filter(isRecord);
  }

  /**
   * The endpoint's valid field set, when the API includes one.
   */
  get availableFields(): Record<string, unknown> | null {
    const data = this.responseData;
    if (!isRecord(data)) return null;
    const val = data.available_fields;
    return isRecord(val) ? val : null;
  }
}

export class TangoRateLimitError extends TangoAPIError {
  constructor(message = "Rate limit exceeded", statusCode?: number, responseData?: unknown) {
    super(message, statusCode, responseData);
    this.name = "TangoRateLimitError";
  }
}

export class TangoTimeoutError extends TangoAPIError {
  constructor(message = "Request timed out", statusCode?: number, responseData?: unknown) {
    super(message, statusCode, responseData);
    this.name = "TangoTimeoutError";
  }
}

export class ShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShapeError";

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ShapeValidationError extends ShapeError {
  constructor(message: string) {
    super(message);
    this.name = "ShapeValidationError";
  }
}

export class ShapeParseError extends ShapeError {
  constructor(message: string) {
    super(message);
    this.name = "ShapeParseError";
  }
}

export class TypeGenerationError extends ShapeError {
  constructor(message: string) {
    super(message);
    this.name = "TypeGenerationError";
  }
}

export class ModelInstantiationError extends ShapeError {
  readonly fieldName?: string | null;
  readonly expectedType?: string | null;
  readonly actualValue?: unknown;

  constructor(message: string, fieldName?: string | null, expectedType?: string | null, actualValue?: unknown) {
    super(message);
    this.name = "ModelInstantiationError";
    this.fieldName = fieldName;
    this.expectedType = expectedType;
    this.actualValue = actualValue;
  }
}
