/**
 * Reverse shape-coverage gate: Tango's shape trees -> SDK schemas.
 *
 * Port of `scripts/check_shape_coverage.py` from tango-python.
 *
 * The conformance check (check-filter-shape-conformance.ts) validates one direction only: that the SDK's ShapeConfig constants reference allowed fields.
 * This checks the reverse — that the SDK actually captures every field and expand Tango exposes.
 * A field Tango returns that the SDK schema lacks can't be requested through the typed shape API at all, so that reverse gap is where the SDK silently under-serves users.
 *
 * It walks each resource's real shape tree from the vendored contract (contracts/filter_shape_contract.json — Tango's own generated truth) against the SDK's explicit schema registry (src/shapes/explicitSchemas.ts) and reports what Tango exposes that the SDK does not capture:
 *
 *   missing_field           Tango exposes a leaf field; SDK schema has no such key.
 *   missing_expand          Tango exposes a whole nested expand; SDK schema lacks it.
 *   expand_flat             SDK carries the expand as a scalar with no nested schema, so its sub-fields are unreachable.
 *   unmapped_resource       A resource has a contract shape tree but no SDK schema.
 *   contract_missing_shape  A shaping resource publishes no shape tree (upstream contract defect).
 *
 * Fully local: no network, no API key, no tango checkout — it reads the vendored contract, so it runs on forks and in tokenless CI.
 * TANGO_CONTRACT_PATH points it at a live/local tango checkout's contract instead.
 *
 * Baseline: contracts/shape_coverage_baseline.json records the currently-known gaps.
 * The gate fails only on findings NOT in the baseline — new drift fails immediately while the known backlog is burned down separately.
 * Refresh with --update-baseline after intentionally changing coverage.
 *
 * Exit codes: 0 = no new gaps, 1 = new gaps beyond the baseline, 2 = setup error.
 * Run: npx tsx scripts/check-shape-coverage.ts [--update-baseline] [--json]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { SchemaRegistry } from "../src/shapes/schema.js";
import type { FieldSchemaMap } from "../src/shapes/schemaTypes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const VENDORED_CONTRACT_PATH = path.join(REPO_ROOT, "contracts", "filter_shape_contract.json");
const DEFAULT_CONTRACT_PATH = process.env.TANGO_CONTRACT_PATH
  ? path.resolve(process.env.TANGO_CONTRACT_PATH)
  : VENDORED_CONTRACT_PATH;
const DEFAULT_BASELINE_PATH = path.join(REPO_ROOT, "contracts", "shape_coverage_baseline.json");

// Contract resource key -> SDK model name in the explicit schema registry.
// A resource whose model is not registered is reported as unmapped_resource.
export const RESOURCE_TO_MODEL: Record<string, string> = {
  contracts: "Contract",
  idvs: "IDV",
  vehicles: "Vehicle",
  otas: "OTA",
  otidvs: "OTIDV",
  subawards: "Subaward",
  organizations: "Organization",
  opportunities: "Opportunity",
  notices: "Notice",
  forecasts: "Forecast",
  grants: "Grant",
  entities: "Entity",
  agencies: "Agency",
  naics: "Naics",
  gsa_elibrary_contracts: "GsaElibraryContract",
  itdashboard: "ITDashboardInvestment",
  // Nested routes are keyed with a slash in the contract ("budget/accounts").
  // The pre-slash key is kept so an older vendored contract still maps.
  "budget/accounts": "BudgetAccount",
  budget_accounts: "BudgetAccount",
  protests: "Protest",
  offices: "Office",
  assistance_listings: "AssistanceListing",
  business_types: "BusinessType",
  departments: "Department",
  psc: "PSC",
  mas_sins: "MasSin",
  "dibbs/rfqs": "DibbsRfq",
  "dibbs/rfps": "DibbsRfp",
  "dibbs/awards": "DibbsAward",
  exclusions: "Exclusion",
  "sbir/topics": "SbirTopic",
  "sbir/solicitations": "SbirSolicitation",
  events: "Event",
  news: "News",
};

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

export interface ShapeNode {
  fields?: string[] | null;
  expands?: Record<string, ShapeNode> | null;
}

interface ResourceRuntime {
  shape?: ShapeNode | null;
  shape_supported?: boolean;
  shape_error?: string | null;
}

export interface Contract {
  resources?: Record<string, { runtime?: ResourceRuntime | null }>;
}

export interface Finding {
  kind:
    | "missing_field"
    | "missing_expand"
    | "expand_flat"
    | "unresolved_node"
    | "unmapped_resource"
    | "contract_missing_shape";
  resource: string;
  path: string;
  name?: string;
  sub_nodes?: number;
}

// ---------------------------------------------------------------------------
// Gap collection
// ---------------------------------------------------------------------------

function tryGetSchema(registry: SchemaRegistry, modelName: string | undefined): FieldSchemaMap | null {
  if (!modelName) return null;
  try {
    return registry.getSchema(modelName).fields;
  } catch {
    return null;
  }
}

/**
 * Walk every resource's contract shape tree against the SDK schema registry.
 * Returns a flat list of finding records keyed for baseline diffing.
 */
export function collectGaps(contract: Contract, registry: SchemaRegistry | null): Finding[] {
  const findings: Finding[] = [];

  const walk = (
    resource: string,
    nodePath: string,
    node: ShapeNode,
    schema: FieldSchemaMap | null,
  ): void => {
    // A node the SDK can't resolve to a schema — its whole subtree is uncheckable.
    if (schema === null) {
      findings.push({ kind: "unresolved_node", resource, path: nodePath || "(root)" });
      return;
    }
    const fields = node.fields ?? [];
    // A wildcard node ("*") permits any key, so leaf coverage is vacuously satisfied.
    const wildcard = fields.includes("*");
    if (!wildcard) {
      for (const f of fields) {
        if (f === "*") continue;
        if (!(f in schema)) {
          findings.push({
            kind: "missing_field",
            resource,
            path: nodePath || "(root)",
            name: f,
          });
        }
      }
    }
    for (const [ename, enode] of Object.entries(node.expands ?? {})) {
      const fs_ = schema[ename];
      const childPath = nodePath ? `${nodePath}.${ename}` : ename;
      // A wildcard expand ("*") is freeform (any key permitted) — the SDK
      // carrying it as a plain dict is full coverage, not a flattened gap.
      if (fs_ !== undefined && (enode.fields ?? []).includes("*")) {
        continue;
      }
      if (fs_ === undefined) {
        const sub = (enode.fields ?? []).length + Object.keys(enode.expands ?? {}).length;
        findings.push({
          kind: "missing_expand",
          resource,
          path: nodePath || "(root)",
          name: ename,
          sub_nodes: sub,
        });
        continue;
      }
      const childSchema = fs_.nestedModel ? tryGetSchema(registry!, fs_.nestedModel) : null;
      if (childSchema === null) {
        // SDK has the key but as a scalar (no nested schema) — Tango models
        // it as an object, so its sub-fields are unreachable through shapes.
        findings.push({ kind: "expand_flat", resource, path: nodePath || "(root)", name: ename });
        continue;
      }
      walk(resource, childPath, enode, childSchema);
    }
  };

  for (const [rkey, r] of Object.entries(contract.resources ?? {})) {
    const runtime = r.runtime ?? {};
    const shape = runtime.shape;
    if (!shape) {
      // Contracts at schema_version >= 2 declare shape_supported, so a null
      // tree on a shaping resource is a hard finding (the contract understates
      // the API). Older contracts omit the key; there null is genuinely
      // ambiguous and skipping stays the only safe read.
      if (runtime.shape_supported) {
        findings.push({
          kind: "contract_missing_shape",
          resource: rkey,
          path: "(root)",
          name: runtime.shape_error ?? "no shape tree published",
        });
      }
      continue;
    }
    const modelName = RESOURCE_TO_MODEL[rkey];
    const schema = registry ? tryGetSchema(registry, modelName) : null;
    if (schema === null) {
      findings.push({
        kind: "unmapped_resource",
        resource: rkey,
        path: "(root)",
        name: modelName ?? "(no model mapped)",
      });
      continue;
    }
    walk(rkey, "", shape, schema);
  }

  return findings;
}

/**
 * Stable identity for baseline diffing — ignores volatile counts like sub_nodes.
 */
export function findingKey(f: Finding): string {
  return [f.kind, f.resource, f.path ?? "", String(f.name ?? "")].join("|");
}

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------

export function loadBaseline(baselinePath: string): Set<string> {
  if (!fs.existsSync(baselinePath)) return new Set();
  const data = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as { known_gaps?: string[] };
  return new Set(data.known_gaps ?? []);
}

function writeBaseline(baselinePath: string, findings: Finding[]): void {
  const keys = findings.map(findingKey).sort();
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        description:
          "Known reverse shape-coverage gaps (Tango exposes, SDK schema lacks), accepted as a tracked backlog. check-shape-coverage.ts fails only on gaps NOT listed here. Burn down and regenerate with --update-baseline.",
        count: keys.length,
        known_gaps: keys,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function printGrouped(title: string, findings: Finding[]): void {
  if (findings.length === 0) return;
  process.stdout.write(`\n${title} (${findings.length}):\n`);
  const byRes = new Map<string, Finding[]>();
  for (const f of findings) {
    const rows = byRes.get(f.resource) ?? [];
    rows.push(f);
    byRes.set(f.resource, rows);
  }
  for (const res of [...byRes.keys()].sort()) {
    const rows = byRes.get(res)!;
    process.stdout.write(`  ${res} (${rows.length}):\n`);
    const sorted = [...rows].sort((a, b) =>
      `${a.path}|${a.name ?? ""}`.localeCompare(`${b.path}|${b.name ?? ""}`),
    );
    for (const f of sorted) {
      const extra = f.sub_nodes ? `  (+${f.sub_nodes} sub-nodes)` : "";
      process.stdout.write(
        f.name ? `      ${f.path} -> ${f.name}${extra}\n` : `      ${f.path}\n`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface RunShapeCoverageOptions {
  contractPath?: string;
  baselinePath?: string;
  updateBaseline?: boolean;
  json?: boolean;
}

export function runShapeCoverage(opts: RunShapeCoverageOptions = {}): number {
  const contractPath = opts.contractPath ?? DEFAULT_CONTRACT_PATH;
  const baselinePath = opts.baselinePath ?? DEFAULT_BASELINE_PATH;

  if (!fs.existsSync(contractPath)) {
    process.stderr.write(`error: vendored contract not found at ${contractPath}\n`);
    return 2;
  }

  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8")) as Contract;
  const registry = new SchemaRegistry();
  const findings = collectGaps(contract, registry);

  if (opts.updateBaseline) {
    writeBaseline(baselinePath, findings);
    process.stdout.write(
      `Wrote ${path.relative(REPO_ROOT, baselinePath)} with ${findings.length} known gaps.\n`,
    );
    return 0;
  }

  const baseline = loadBaseline(baselinePath);
  const currentKeys = new Set(findings.map(findingKey));
  const newFindings = findings.filter((f) => !baseline.has(findingKey(f)));
  const fixed = [...baseline].filter((k) => !currentKeys.has(k)).sort();

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        { new: newFindings, total: findings.length, baseline: baseline.size, fixed },
        null,
        2,
      ) + "\n",
    );
    return newFindings.length > 0 ? 1 : 0;
  }

  process.stdout.write(
    `Shape coverage: ${findings.length} total gaps, ${baseline.size} baselined, ${newFindings.length} NEW, ${fixed.length} fixed since baseline.\n`,
  );
  if (fixed.length > 0) {
    process.stdout.write(
      `\n${fixed.length} baselined gap(s) now fixed — run --update-baseline to shrink the baseline:\n`,
    );
    for (const k of fixed) process.stdout.write(`      ${k}\n`);
  }
  if (newFindings.length === 0) {
    process.stdout.write("\nNo new shape-coverage drift.\n");
    return 0;
  }

  const contractGaps = newFindings.filter((f) => f.kind === "contract_missing_shape");
  if (contractGaps.length > 0) {
    process.stdout.write(
      "\n*** CONTRACT DEFECT — these resources support shaping but publish no shape tree ***\n",
    );
    printGrouped("RESOURCES WITH NO SHAPE TREE", contractGaps);
    process.stdout.write(
      "\n  This is an upstream problem, not an SDK one: the vendored contract understates\n" +
        "  the API, so coverage cannot be checked for these resources at all. Refresh the\n" +
        "  vendored contract from makegov/tango; if it persists, the generator is failing\n" +
        "  to extract them.\n",
    );
  }

  process.stdout.write(
    "\n*** NEW shape-coverage drift (Tango exposes these; the SDK schema does not) ***\n",
  );
  printGrouped(
    "MISSING FIELDS",
    newFindings.filter((f) => f.kind === "missing_field"),
  );
  printGrouped(
    "MISSING EXPANDS",
    newFindings.filter((f) => f.kind === "missing_expand"),
  );
  printGrouped(
    "EXPANDS FLATTENED (no nested schema)",
    newFindings.filter((f) => f.kind === "expand_flat"),
  );
  printGrouped(
    "UNRESOLVED NODES",
    newFindings.filter((f) => f.kind === "unresolved_node"),
  );
  printGrouped(
    "UNMAPPED RESOURCES",
    newFindings.filter((f) => f.kind === "unmapped_resource"),
  );
  process.stdout.write(
    "\nFix the SDK schema (src/shapes/explicitSchemas.ts), or if intentional, run --update-baseline.\n",
  );
  return 1;
}

function main(): number {
  const argv = process.argv.slice(2);
  const opts: RunShapeCoverageOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--update-baseline") {
      opts.updateBaseline = true;
    } else if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--contract") {
      opts.contractPath = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith("--contract=")) {
      opts.contractPath = path.resolve(arg.slice("--contract=".length));
    } else if (arg === "-h" || arg === "--help") {
      process.stdout.write(
        "Usage: tsx scripts/check-shape-coverage.ts [--update-baseline] [--json] [--contract PATH]\n",
      );
      return 0;
    }
  }
  return runShapeCoverage(opts);
}

// Run main only when invoked directly (not when imported by tests).
const isDirectRun = (() => {
  try {
    const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
    return invoked === __filename;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  process.exit(main());
}
