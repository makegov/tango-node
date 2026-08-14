/**
 * Generate src/shapes/generatedOverlay.ts — the reverse shape-coverage overlay.
 *
 * Port of tango-python's scripts/generate_shape_overlay.py.
 *
 * check-shape-coverage.ts detects fields/expands Tango's shape trees expose that the hand-curated src/shapes/explicitSchemas.ts does not capture.
 * This generates the schema additions that close every such gap, and SchemaRegistry merges the result over the base so the SDK's typed shape API accepts everything the API returns.
 *
 * Inputs (both vendored — regenerates with no network/API key):
 *   contracts/filter_shape_contract.json   Tango's shape trees (names + nesting).
 *   contracts/observed_shape_types.json    per-path types/list-ness sampled from the live API (vendored from tango-python, which probes production).
 *
 * Reads the curated base directly from EXPLICIT_SCHEMAS — never through SchemaRegistry, which auto-merges this overlay (that would feed the generator its own output).
 *
 * Type resolution per field: live-API observation -> structural equivalence (vehicles.awardees mirror idvs, .orders mirror contracts) -> name heuristic.
 * {code,description} expands point at the shared "CodeDescription" schema; freeform ("*") expands stay plain dicts.
 * Identical nested shapes are interned to one schema.
 *
 * Output is deterministic: stable sort order everywhere, no timestamps.
 *
 * Run: npx tsx scripts/generate-shape-overlay.ts            # writes the module
 *      npx tsx scripts/generate-shape-overlay.ts --report   # print gaps, write nothing
 *
 * `TANGO_CONTRACT_PATH` (env) or `--contract PATH` points the generator at a non-vendored contract, matching the two check scripts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { EXPLICIT_SCHEMAS } from "../src/shapes/explicitSchemas.js";
import type { FieldSchemaMap } from "../src/shapes/schemaTypes.js";
import { RESOURCE_TO_MODEL } from "./check-shape-coverage.js";
import type { Contract, ShapeNode } from "./check-shape-coverage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
const VENDORED_CONTRACT_PATH = path.join(REPO_ROOT, "contracts", "filter_shape_contract.json");

function resolveContractPath(): string {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--contract" && argv[i + 1]) return path.resolve(argv[i + 1]);
    if (argv[i].startsWith("--contract=")) return path.resolve(argv[i].slice("--contract=".length));
  }
  if (process.env.TANGO_CONTRACT_PATH) return path.resolve(process.env.TANGO_CONTRACT_PATH);
  return VENDORED_CONTRACT_PATH;
}

const CONTRACT_PATH = resolveContractPath();
const OBSERVED_PATH = path.join(REPO_ROOT, "contracts", "observed_shape_types.json");
const OUT_PATH = path.join(REPO_ROOT, "src", "shapes", "generatedOverlay.ts");

interface ObservedPath {
  kind?: string;
  type?: string;
  is_list?: boolean;
  is_optional?: boolean;
}

type ObservedFile = Record<string, { paths?: Record<string, ObservedPath> }>;

const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, "utf8")) as Contract;
const observed = JSON.parse(fs.readFileSync(OBSERVED_PATH, "utf8")) as ObservedFile;

const DATE_NAMES = new Set(["start_date", "end_date", "award_date"]);

interface Entry {
  type: string;
  isList: boolean;
  nested: string | null;
}

function baseSchema(modelName: string | undefined | null): FieldSchemaMap | null {
  if (!modelName) return null;
  return EXPLICIT_SCHEMAS[modelName] ?? null;
}

function heuristic(name: string): [string, boolean] {
  const n = name.toLowerCase();
  if (n.endsWith("_date") || DATE_NAMES.has(n)) return ["date", false];
  if (n.endsWith("_datetime") || n.endsWith("_at") || n.endsWith("_timestamp") || n === "created" || n === "modified") {
    return ["datetime", false];
  }
  if (
    n.endsWith("_amount") ||
    n.endsWith("_value") ||
    n.endsWith("_price") ||
    n.endsWith("_obligations") ||
    n.endsWith("_ceiling") ||
    n.endsWith("_cost") ||
    n.endsWith("_fee")
  ) {
    return ["Decimal", false];
  }
  if (n.startsWith("is_") || n.startsWith("has_")) return ["bool", false];
  if (n.endsWith("_count") || n.endsWith("_rank") || n.startsWith("number_of_")) return ["int", false];
  return ["str", false];
}

function observedPaths(res: string): Record<string, ObservedPath> {
  return observed[res]?.paths ?? {};
}

function fullPath(nodePath: string, name: string): string {
  return nodePath && nodePath !== "(root)" ? `${nodePath}.${name}` : name;
}

// Vehicles' awardees mirror idvs and awardees.orders mirror contracts, so their
// observations stand in where vehicles itself was never sampled at that depth.
function equivLookup(res: string, nodePath: string, name: string): ObservedPath | undefined {
  const full = fullPath(nodePath, name);
  if (res === "vehicles") {
    if (full.startsWith("awardees.orders.")) {
      return observedPaths("contracts")[full.slice("awardees.orders.".length)];
    }
    if (full.startsWith("awardees.")) {
      return observedPaths("idvs")[full.slice("awardees.".length)];
    }
  }
  return undefined;
}

function resolveScalar(res: string, nodePath: string, name: string): [string, boolean] {
  const full = fullPath(nodePath, name);
  const d = observedPaths(res)[full];
  if (d && d.kind === "scalar" && d.type) return [d.type, Boolean(d.is_list)];
  const e = equivLookup(res, nodePath, name);
  if (e && e.kind === "scalar" && e.type) return [e.type, Boolean(e.is_list)];
  return heuristic(name);
}

function isCodeObject(node: ShapeNode, res: string, nodePath: string, name: string): boolean {
  const fields = new Set(node.fields ?? []);
  const expands = node.expands ?? {};
  if (fields.size === 2 && fields.has("code") && fields.has("description") && Object.keys(expands).length === 0) {
    return true;
  }
  const d = observedPaths(res)[fullPath(nodePath, name)] ?? equivLookup(res, nodePath, name);
  return Boolean(d && d.kind === "code_object");
}

function nodeIsList(res: string, nodePath: string, name: string): boolean {
  const d = observedPaths(res)[fullPath(nodePath, name)] ?? equivLookup(res, nodePath, name);
  return Boolean(d && d.is_list);
}

function isWildcard(node: ShapeNode): boolean {
  return (node.fields ?? []).includes("*");
}

const nestedSchemas: Record<string, Record<string, Entry>> = {};
const bySignature = new Map<string, string>();

function sig(schema: Record<string, Entry>): string {
  const rows = Object.entries(schema)
    .map(([k, v]) => [k, v.type, v.isList, v.nested ?? null])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify(rows);
}

function titleName(name: string): string {
  return name
    .split("_")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join("");
}

function internNested(preferred: string, schema: Record<string, Entry>): string {
  const s = sig(schema);
  const existing = bySignature.get(s);
  if (existing) return existing;
  let name = preferred;
  let i = 2;
  // Also dodge curated model names: a generated nested named e.g. "Vehicle" would
  // merge its summary fields over the real Vehicle model schema in the registry.
  while (name in nestedSchemas || name in EXPLICIT_SCHEMAS) {
    name = `${preferred}${i}`;
    i += 1;
  }
  nestedSchemas[name] = schema;
  bySignature.set(s, name);
  return name;
}

function entry(type: string, isList: boolean, nested: string | null = null): Entry {
  return { type, isList, nested };
}

function buildNested(res: string, nodePath: string, name: string, node: ShapeNode): string {
  const npath = fullPath(nodePath, name);
  const schema: Record<string, Entry> = {};
  for (const f of node.fields ?? []) {
    if (f === "*") continue;
    const [t, lst] = resolveScalar(res, npath, f);
    schema[f] = entry(t, lst);
  }
  for (const [cname, cnode] of Object.entries(node.expands ?? {})) {
    schema[cname] = expandEntry(res, npath, cname, cnode);
  }
  return internNested(titleName(name), schema);
}

function expandEntry(res: string, nodePath: string, ename: string, enode: ShapeNode): Entry {
  if (isWildcard(enode)) return entry("dict", nodeIsList(res, nodePath, ename));
  if (isCodeObject(enode, res, nodePath, ename)) {
    return entry("dict", nodeIsList(res, nodePath, ename), "CodeDescription");
  }
  return entry("dict", nodeIsList(res, nodePath, ename), buildNested(res, nodePath, ename, enode));
}

const overlay: Record<string, Record<string, Entry>> = {};
const reportRows: string[] = [];

function walk(res: string, nodePath: string, node: ShapeNode, schema: FieldSchemaMap | null, container: string): void {
  if (schema === null) return;
  const fields = node.fields ?? [];
  if (!fields.includes("*")) {
    for (const f of fields) {
      if (f === "*" || f in schema) continue;
      const [t, lst] = resolveScalar(res, nodePath, f);
      (overlay[container] ??= {})[f] = entry(t, lst);
      reportRows.push(`${res}:${nodePath || "(root)"}.${f}  ->  ${t}${lst ? "[]" : ""}`);
    }
  }
  for (const [ename, enode] of Object.entries(node.expands ?? {})) {
    const fs_ = schema[ename];
    const childPath = fullPath(nodePath, ename);
    const nestedName = fs_?.nestedModel ?? null;
    const childSchema = nestedName ? baseSchema(nestedName) : null;
    if (fs_ === undefined || childSchema === null) {
      if (isWildcard(enode) && fs_ !== undefined) continue;
      (overlay[container] ??= {})[ename] = expandEntry(res, nodePath, ename, enode);
      reportRows.push(`${res}:${nodePath || "(root)"}.${ename}  ->  expand`);
    } else {
      walk(res, childPath, enode, childSchema, nestedName!);
    }
  }
}

for (const [rkey, r] of Object.entries(contract.resources ?? {})) {
  const shape = r.runtime?.shape;
  if (!shape) continue;
  const modelName = RESOURCE_TO_MODEL[rkey];
  const schema = baseSchema(modelName);
  if (schema === null) {
    // No curated base at all — mint the whole model schema into the overlay.
    const s: Record<string, Entry> = {};
    for (const f of shape.fields ?? []) {
      if (f === "*") continue;
      const [t, lst] = resolveScalar(rkey, "", f);
      s[f] = entry(t, lst);
    }
    for (const [cname, cnode] of Object.entries(shape.expands ?? {})) {
      s[cname] = expandEntry(rkey, "", cname, cnode);
    }
    if (modelName) {
      overlay[modelName] = { ...(overlay[modelName] ?? {}), ...s };
      reportRows.push(`${rkey}:(root)  ->  full model schema (${Object.keys(s).length} fields)`);
    }
    continue;
  }
  walk(rkey, "", shape, schema, modelName);
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function emitKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function renderField(name: string, e: Entry): string {
  const args = [JSON.stringify(name), JSON.stringify(e.type)];
  if (e.isList || e.nested) args.push(String(e.isList));
  if (e.nested) args.push(JSON.stringify(e.nested));
  return `${emitKey(name)}: f(${args.join(", ")}),`;
}

function renderSchemaMap(schema: Record<string, Entry>, indent: string): string[] {
  return Object.keys(schema)
    .sort()
    .map((n) => `${indent}${renderField(n, schema[n])}`);
}

function emit(): string {
  const lines: string[] = [
    "// GENERATED by scripts/generate-shape-overlay.ts — do not edit by hand.",
    "//",
    "// Reverse shape-coverage overlay: the fields and expands Tango's shape trees",
    "// expose that the hand-curated explicitSchemas.ts did not capture. SchemaRegistry",
    "// merges this over the base schemas so the SDK's typed shape API accepts everything",
    "// the API returns. Regenerate after refreshing the vendored contract or observations.",
    "",
    'import type { FieldSchema, FieldSchemaMap } from "./schemaTypes.js";',
    "",
    "function f(name: string, type: string, isList = false, nestedModel: string | null = null): FieldSchema {",
    "  return { name, type, isOptional: true, isList, nestedModel };",
    "}",
    "",
    "// Nested schemas referenced by overlay entries, registered as standalone models.",
    "export const GENERATED_NESTED: Record<string, FieldSchemaMap> = {",
  ];
  for (const ref of Object.keys(nestedSchemas).sort()) {
    lines.push(`  ${emitKey(ref)}: {`);
    lines.push(...renderSchemaMap(nestedSchemas[ref], "    "));
    lines.push("  },");
  }
  lines.push("};", "");
  lines.push("// Container model-name -> additional field schemas (merged over the base).");
  lines.push("export const GENERATED_OVERLAY: Record<string, FieldSchemaMap> = {");
  for (const model of Object.keys(overlay).sort()) {
    lines.push(`  ${emitKey(model)}: {`);
    lines.push(...renderSchemaMap(overlay[model], "    "));
    lines.push("  },");
  }
  lines.push("};", "");
  return lines.join("\n");
}

function main(): number {
  const report = process.argv.includes("--report");
  const nFields = Object.values(overlay).reduce((acc, v) => acc + Object.keys(v).length, 0);
  const nNested = Object.keys(nestedSchemas).length;

  if (report) {
    for (const row of [...reportRows].sort()) process.stdout.write(`${row}\n`);
    process.stdout.write(
      `\n${nFields} additions across ${Object.keys(overlay).length} containers, ${nNested} nested schemas.\n`,
    );
    return 0;
  }

  fs.writeFileSync(OUT_PATH, emit(), "utf8");
  process.stdout.write(
    `wrote ${path.relative(REPO_ROOT, OUT_PATH)}: ${nFields} fields across ${Object.keys(overlay).length} containers, ${nNested} nested schemas.\n`,
  );
  return 0;
}

process.exit(main());
