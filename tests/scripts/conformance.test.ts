import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import { runConformance } from "../../scripts/check-filter-shape-conformance.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, "fixtures");
const MINI_CLIENT = path.join(FIXTURES_DIR, "mini-client.ts");
const REAL_MANIFEST = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "tango",
  "contracts",
  "filter_shape_contract.json",
);

describe("check-filter-shape-conformance script", () => {
  it("zero errors when the SDK exposes every manifest filter (typed)", () => {
    const result = runConformance({
      manifestPath: path.join(FIXTURES_DIR, "mini-manifest-ok.json"),
      clientPath: MINI_CLIENT,
      skipShapes: true,
      resourceMap: { foos: "listFoos" },
    });
    expect(result.errors).toEqual([]);
    // The fixture's interface has no index signature → no kwargs-style warning.
    expect(result.warnings).toEqual([]);
  });

  it("reports an error when the SDK is missing a typed filter", () => {
    const result = runConformance({
      manifestPath: path.join(FIXTURES_DIR, "mini-manifest-missing.json"),
      clientPath: MINI_CLIENT,
      skipShapes: true,
      resourceMap: { bars: "listBars" },
    });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/bars/);
    expect(result.errors[0]).toMatch(/awarding_agency/);
    // Only the one missing filter should be flagged.
    expect(result.errors[0]).not.toMatch(/fiscal_year/);
  });

  it("downgrades missing filters to warnings when the Options interface has an index signature", () => {
    const result = runConformance({
      manifestPath: path.join(FIXTURES_DIR, "mini-manifest-indexsig.json"),
      clientPath: MINI_CLIENT,
      skipShapes: true,
      resourceMap: { baz: "listBaz" },
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toMatch(/index signature/);
    expect(result.warnings[0]).toMatch(/awarding_agency/);
    expect(result.warnings[0]).toMatch(/fiscal_year/);
  });

  it("reports an error when the mapped method does not exist on the client", () => {
    const result = runConformance({
      manifestPath: path.join(FIXTURES_DIR, "mini-manifest-ok.json"),
      clientPath: MINI_CLIENT,
      skipShapes: true,
      resourceMap: { foos: "listNonExistent" },
    });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/listNonExistent/);
    expect(result.errors[0]).toMatch(/not found/);
  });

  it("runs against the real manifest and produces well-formed JSON", () => {
    // The real manifest path is optional — skip if a sibling tango checkout
    // doesn't exist on this machine.
    if (!fs.existsSync(REAL_MANIFEST)) {
      console.warn(`Skipping: real manifest not found at ${REAL_MANIFEST}`);
      return;
    }

    const result = runConformance({ manifestPath: REAL_MANIFEST });

    expect(typeof result).toBe("object");
    expect(result.manifest).toBe(path.resolve(REAL_MANIFEST));
    expect(Array.isArray(result.errors)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);

    // Every entry should be a string.
    for (const e of result.errors) expect(typeof e).toBe("string");
    for (const w of result.warnings) expect(typeof w).toBe("string");

    // Surface the current state for transparency.
    // eslint-disable-next-line no-console
    console.log(
      `[conformance] real manifest: errors=${result.errors.length}, warnings=${result.warnings.length}`,
    );
  });
});
