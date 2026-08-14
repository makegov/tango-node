import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import { runConformance } from "../../scripts/check-filter-shape-conformance.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_DIR = path.join(__dirname, "fixtures");
const MINI_CLIENT = path.join(FIXTURES_DIR, "mini-client.ts");
const VENDORED_CONTRACT = path.resolve(
  __dirname,
  "..",
  "..",
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
      baselinePath: null,
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
      baselinePath: null,
    });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/bars/);
    expect(result.errors[0]).toMatch(/awarding_agency/);
    // Only the one missing filter should be flagged.
    expect(result.errors[0]).not.toMatch(/fiscal_year/);
  });

  it("downgrades a baselined missing filter to a warning", () => {
    const result = runConformance({
      manifestPath: path.join(FIXTURES_DIR, "mini-manifest-missing.json"),
      clientPath: MINI_CLIENT,
      skipShapes: true,
      resourceMap: { bars: "listBars" },
      baselinePath: path.join(FIXTURES_DIR, "mini-baseline.json"),
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toMatch(/known gaps \(baselined\)/);
    expect(result.warnings[0]).toMatch(/awarding_agency/);
  });

  it("treats a null-mapped resource as an error unless baselined", () => {
    const hard = runConformance({
      manifestPath: path.join(FIXTURES_DIR, "mini-manifest-ok.json"),
      clientPath: MINI_CLIENT,
      skipShapes: true,
      resourceMap: { foos: null },
      baselinePath: null,
    });
    expect(hard.errors.length).toBe(1);
    expect(hard.errors[0]).toMatch(/foos: no SDK method implemented/);

    const accepted = runConformance({
      manifestPath: path.join(FIXTURES_DIR, "mini-manifest-ok.json"),
      clientPath: MINI_CLIENT,
      skipShapes: true,
      resourceMap: { foos: null },
      baselinePath: path.join(FIXTURES_DIR, "mini-baseline.json"),
    });
    expect(accepted.errors).toEqual([]);
    expect(accepted.warnings.some((w) => /foos.*baselined as accepted gap/.test(w))).toBe(true);
  });

  it("warns about baseline entries no longer needed", () => {
    const result = runConformance({
      manifestPath: path.join(FIXTURES_DIR, "mini-manifest-ok.json"),
      clientPath: MINI_CLIENT,
      skipShapes: true,
      resourceMap: { foos: "listFoos" },
      baselinePath: path.join(FIXTURES_DIR, "mini-baseline-stale.json"),
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => /foos: baseline entries no longer needed/.test(w))).toBe(
      true,
    );
    expect(
      result.warnings.some((w) => /unimplemented_resources baseline entry no longer needed/.test(w)),
    ).toBe(true);
  });

  it("downgrades missing filters to warnings when the Options interface has an index signature", () => {
    const result = runConformance({
      manifestPath: path.join(FIXTURES_DIR, "mini-manifest-indexsig.json"),
      clientPath: MINI_CLIENT,
      skipShapes: true,
      resourceMap: { baz: "listBaz" },
      baselinePath: null,
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
      baselinePath: null,
    });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/listNonExistent/);
    expect(result.errors[0]).toMatch(/not found/);
  });

  it("passes against the vendored contract with the committed baseline (the CI gate)", () => {
    const result = runConformance({ manifestPath: VENDORED_CONTRACT });

    expect(result.manifest).toBe(VENDORED_CONTRACT);
    expect(result.errors).toEqual([]);
    for (const w of result.warnings) expect(typeof w).toBe("string");
  });

  it("fails against the vendored contract when the baseline is withheld", () => {
    // Proves the gate has teeth: the pending resources (dibbs/*, exclusions,
    // sbir/*) error without their baseline entries.
    const result = runConformance({ manifestPath: VENDORED_CONTRACT, baselinePath: null });

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => /dibbs/.test(e))).toBe(true);
  });
});
