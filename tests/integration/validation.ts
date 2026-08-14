/** Shared response-shape assertions, mirroring python's tests/integration/validation.py. */

import { expect } from "vitest";

import type { PaginatedResponse } from "../../src/types.js";

type AnyRecord = Record<string, unknown>;

export function expectPagination(res: PaginatedResponse<AnyRecord>): void {
  expect(typeof res.count).toBe("number");
  expect(res.count).toBeGreaterThanOrEqual(0);
  expect(Array.isArray(res.results)).toBe(true);
  expect(res.next === null || typeof res.next === "string").toBe(true);
  expect(res.previous === null || typeof res.previous === "string").toBe(true);
}

export function expectNonEmpty(res: PaginatedResponse<AnyRecord>): AnyRecord {
  expectPagination(res);
  expect(res.count).toBeGreaterThan(0);
  expect(res.results.length).toBeGreaterThan(0);
  return res.results[0];
}

export function expectFields(record: AnyRecord, fields: string[]): void {
  for (const field of fields) {
    expect(record, `expected field '${field}'`).toHaveProperty(field);
  }
}
