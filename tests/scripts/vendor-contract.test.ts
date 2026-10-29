import * as fs from "node:fs";
import { describe, it, expect } from "vitest";

import { VENDORED_CONTRACT_PATH, projectContract, serializeContract } from "../../scripts/vendor-contract.js";

const UPSTREAM = {
  meta: { api_version: "9.9.9", schema_version: 2, description: "d", generated_from: "internal/path" },
  policy: { audit: [] },
  unmapped_resources: { no_docs_page: ["widgets"] },
  resources: {
    widgets: {
      resource_key: "widgets",
      prefix: "widgets",
      basename: "widget",
      docs_file: "internal/widgets.md",
      docs_params: ["name"],
      runtime: {
        viewset: "internal.module.View",
        filter_params: ["name", "kind"],
        filter_params_detail: {
          name: { type: "string", filter_class: "InternalA" },
          kind: { type: "choice", filter_class: "InternalB", choices: ["a", "b"] },
        },
        ordering_fields: ["name"],
        pagination: { class: "InternalPager", max_page_size: 100 },
        shape: { fields: ["name"], expands: {} },
        shape_flat_paths: ["name"],
      },
    },
    bare: { resource_key: "bare", runtime: null },
  },
};

function collectKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, out));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      out.add(key);
      collectKeys(child, out);
    }
  }
  return out;
}

const DROPPED = ["generated_from", "policy", "unmapped_resources", "docs_file", "docs_params", "viewset", "class", "filter_class"];

describe("vendor-contract projection", () => {
  it("drops the server-side keys", () => {
    const keys = collectKeys(projectContract(UPSTREAM));
    expect(DROPPED.filter((key) => keys.has(key))).toEqual([]);
  });

  it("keeps everything the SDK consumes", () => {
    expect(projectContract(UPSTREAM)).toEqual({
      meta: { api_version: "9.9.9", schema_version: 2, description: "d" },
      resources: {
        widgets: {
          resource_key: "widgets",
          prefix: "widgets",
          basename: "widget",
          runtime: {
            filter_params: ["name", "kind"],
            filter_params_detail: { name: { type: "string" }, kind: { type: "choice", choices: ["a", "b"] } },
            ordering_fields: ["name"],
            pagination: { max_page_size: 100 },
            shape: { fields: ["name"], expands: {} },
            shape_flat_paths: ["name"],
          },
        },
        bare: { resource_key: "bare", runtime: null },
      },
    });
  });

  it("the committed contract is already a projection", () => {
    const vendored = fs.readFileSync(VENDORED_CONTRACT_PATH, "utf8");
    expect(serializeContract(projectContract(JSON.parse(vendored)))).toBe(vendored);
  });
});
