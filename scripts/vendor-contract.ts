/**
 * Vendor the upstream filter/shape contract into contracts/filter_shape_contract.json.
 *
 * The upstream contract carries server internals; vendor only what the SDK consumes.
 * Every refresh goes through `projectContract`, which drops the server-side keys listed below and keeps everything else verbatim.
 *
 * Run: npx tsx scripts/vendor-contract.ts PATH            # write the projection of PATH ("-" reads stdin)
 *      npx tsx scripts/vendor-contract.ts PATH --check    # exit 1 when the vendored file differs from the projection of PATH
 *
 * After a refresh, run `npm run generate-shape-overlay` and both conformance gates.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");
export const VENDORED_CONTRACT_PATH = path.join(REPO_ROOT, "contracts", "filter_shape_contract.json");

export const DROPPED_TOP_LEVEL_KEYS = ["policy", "unmapped_resources"] as const;
export const DROPPED_META_KEYS = ["generated_from"] as const;
export const DROPPED_RESOURCE_KEYS = ["docs_file", "docs_params"] as const;
export const DROPPED_RUNTIME_KEYS = ["viewset"] as const;
export const DROPPED_PAGINATION_KEYS = ["class"] as const;
export const DROPPED_FILTER_DETAIL_KEYS = ["filter_class"] as const;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function omit(obj: Json, keys: readonly string[]): Json {
  return Object.fromEntries(Object.entries(obj).filter(([key]) => !keys.includes(key)));
}

function projectRuntime(runtime: Json): Json {
  const out = omit(runtime, DROPPED_RUNTIME_KEYS);
  if (isObject(out.pagination)) out.pagination = omit(out.pagination, DROPPED_PAGINATION_KEYS);
  if (isObject(out.filter_params_detail)) {
    out.filter_params_detail = Object.fromEntries(
      Object.entries(out.filter_params_detail).map(([name, detail]) => [name, isObject(detail) ? omit(detail, DROPPED_FILTER_DETAIL_KEYS) : detail]),
    );
  }
  return out;
}

export function projectContract(contract: Json): Json {
  const out = omit(contract, DROPPED_TOP_LEVEL_KEYS);
  if (isObject(out.meta)) out.meta = omit(out.meta, DROPPED_META_KEYS);
  if (isObject(out.resources)) {
    out.resources = Object.fromEntries(
      Object.entries(out.resources).map(([key, resource]) => {
        if (!isObject(resource)) return [key, resource];
        const projected = omit(resource, DROPPED_RESOURCE_KEYS);
        if (isObject(projected.runtime)) projected.runtime = projectRuntime(projected.runtime);
        return [key, projected];
      }),
    );
  }
  return out;
}

export function serializeContract(contract: Json): string {
  return JSON.stringify(contract, null, 2) + "\n";
}

function main(argv: string[]): number {
  const check = argv.includes("--check");
  const positional = argv.filter((arg) => arg !== "--check");
  if (positional.length !== 1) {
    process.stderr.write("usage: vendor-contract.ts <upstream-contract.json | -> [--check]\n");
    return 2;
  }
  const source = positional[0];
  const raw = fs.readFileSync(source === "-" ? 0 : path.resolve(source), "utf8");
  const projected = serializeContract(projectContract(JSON.parse(raw) as Json));

  if (check) {
    const vendored = fs.existsSync(VENDORED_CONTRACT_PATH) ? fs.readFileSync(VENDORED_CONTRACT_PATH, "utf8") : "";
    if (vendored === projected) {
      process.stdout.write("Vendored contract matches the projection of the source.\n");
      return 0;
    }
    process.stdout.write("Vendored contract differs from the projection of the source.\n");
    return 1;
  }

  fs.writeFileSync(VENDORED_CONTRACT_PATH, projected);
  process.stdout.write(`Wrote ${path.relative(REPO_ROOT, VENDORED_CONTRACT_PATH)}.\n`);
  return 0;
}

const isDirectRun = (() => {
  try {
    return process.argv[1] ? path.resolve(process.argv[1]) === __filename : false;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  process.exit(main(process.argv.slice(2)));
}
