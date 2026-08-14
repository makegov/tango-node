import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

import {
  collectGaps,
  findingKey,
  loadBaseline,
  type Contract,
} from "../../scripts/check-shape-coverage.js";
import { SchemaRegistry } from "../../src/shapes/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTRACTS_DIR = path.resolve(__dirname, "..", "..", "contracts");
const VENDORED_CONTRACT = path.join(CONTRACTS_DIR, "filter_shape_contract.json");
const BASELINE = path.join(CONTRACTS_DIR, "shape_coverage_baseline.json");

function contractFor(runtime: Record<string, unknown>): Contract {
  return { resources: { widgets: { runtime } } } as Contract;
}

describe("check-shape-coverage script", () => {
  it("flags a null shape tree on a shaping resource as a contract defect", () => {
    const findings = collectGaps(
      contractFor({ shape: null, shape_supported: true, shape_error: "AttributeError: boom" }),
      null,
    );
    expect(findings.length).toBe(1);
    expect(findings[0].kind).toBe("contract_missing_shape");
    expect(findings[0].resource).toBe("widgets");
    expect(findings[0].name).toContain("AttributeError");
  });

  it("still flags it without a recorded error", () => {
    const findings = collectGaps(contractFor({ shape: null, shape_supported: true }), null);
    expect(findings.map((f) => f.kind)).toEqual(["contract_missing_shape"]);
    expect(findings[0].name).toBe("no shape tree published");
  });

  it("does not flag a resource that genuinely has no shaping (news/events)", () => {
    const findings = collectGaps(contractFor({ shape: null, shape_supported: false }), null);
    expect(findings).toEqual([]);
  });

  it("skips a null tree on an older contract without shape_supported", () => {
    const findings = collectGaps(contractFor({ shape: null }), null);
    expect(findings).toEqual([]);
  });

  it("produces a stable finding key for baselining", () => {
    const key = findingKey({
      kind: "contract_missing_shape",
      resource: "widgets",
      path: "(root)",
      name: "no shape tree published",
    });
    expect(key).toBe("contract_missing_shape|widgets|(root)|no shape tree published");
  });

  it("reports a fabricated unknown field as a missing_field gap", () => {
    const contract: Contract = {
      resources: {
        contracts: {
          runtime: {
            shape_supported: true,
            shape: { fields: ["piid", "definitely_not_a_real_field"], expands: {} },
          },
        },
      },
    };
    const findings = collectGaps(contract, new SchemaRegistry());
    expect(findings.length).toBe(1);
    expect(findings[0].kind).toBe("missing_field");
    expect(findings[0].name).toBe("definitely_not_a_real_field");
    // ...and that gap is not hidden by the committed baseline.
    expect(loadBaseline(BASELINE).has(findingKey(findings[0]))).toBe(false);
  });

  it("accepts a wildcard node without checking leaves", () => {
    const contract: Contract = {
      resources: {
        contracts: {
          runtime: {
            shape_supported: true,
            shape: { fields: ["*", "definitely_not_a_real_field"], expands: {} },
          },
        },
      },
    };
    expect(collectGaps(contract, new SchemaRegistry())).toEqual([]);
  });

  it("passes against the vendored contract with the committed baseline (the CI gate)", () => {
    const contract = JSON.parse(fs.readFileSync(VENDORED_CONTRACT, "utf8")) as Contract;
    const findings = collectGaps(contract, new SchemaRegistry());
    const baseline = loadBaseline(BASELINE);
    const fresh = findings.filter((f) => !baseline.has(findingKey(f)));
    expect(fresh).toEqual([]);
  });

  it("vendored contract publishes a shape tree for every shaping resource", () => {
    const contract = JSON.parse(fs.readFileSync(VENDORED_CONTRACT, "utf8")) as Contract;
    const blind = Object.entries(contract.resources ?? {})
      .filter(([, r]) => r.runtime?.shape_supported && !r.runtime?.shape)
      .map(([name]) => name);
    expect(blind).toEqual([]);
  });
});
