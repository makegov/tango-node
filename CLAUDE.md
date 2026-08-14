# tango-node

<!--
This is a public repository. This file is readable by anyone who clones the repo — keep it free of internal paths, per-developer setup details, and references to private infrastructure.

MakeGov team members: additional local tooling notes are in `.claude/mg-tools-integration.md` (gitignored). Re-run `mg-tools install` after cloning to regenerate it.
-->

## Non-Negotiables

- **Node.js >= 18, ESM-only.** The package is `"type": "module"`, built for native `fetch`; no CommonJS output, no `require()` in source.
- **Public SDK — surface is contract.** Method names, option names, and return shapes are promises. Deprecate, don't break. If you rename a method, leave an alias + `@deprecated` JSDoc for at least one minor version.
- **Always update `CHANGELOG.md`** under `## [Unreleased]` when source files change. Follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) + [SemVer](https://semver.org/).
- **Strict TypeScript.** `npm run typecheck` (`tsc --noEmit`) must pass cleanly; don't loosen `tsconfig.json` to make an error go away.
- **No untyped filter bags on new surface.** Every accepted filter on a new `list*` method must be an explicit typed property on its `Options` interface. The `[key: string]: unknown` index signature exists only for forward-compatibility with not-yet-ported server filters — never as a substitute for typing known ones.
- **Both conformance gates stay green.** `npm run check-conformance` and `npm run check-shape-coverage` are hard CI gates against the vendored contract in `contracts/`. Shrink the baselines as gaps close; never grow them to silence a legitimate failure.
- **Never edit `src/shapes/generatedOverlay.ts` by hand** — regenerate it with `npm run generate-shape-overlay`.
- **Never `git commit` / `push` / `merge` without the user's explicit permission.**
- Use the `gh` CLI for GitHub operations.

## Project conventions

### Toolchain

- **Package manager:** npm, with a committed `package-lock.json` — CI installs with `npm ci --ignore-scripts`. Run `npm install` after changing dependencies so the lockfile stays in sync.
- **Formatter:** Prettier (`npm run format`). **Linter:** ESLint flat config in `eslint.config.js` (`npm run lint`).
- **Type checker:** `tsc` strict mode via `npm run typecheck`.
- **Tests:** Vitest (`npm test` for watch mode, `npx vitest run` for a single pass).
- **Base branch:** `main`.

### Commands

```bash
# install
npm install

# lint / format / types / build
npm run lint
npm run format
npm run typecheck
npm run build

# tests
npx vitest run                 # unit + integration (cassette replay, offline)
npm run coverage               # single pass with v8 coverage

# conformance gates (offline, against contracts/filter_shape_contract.json)
npm run check-conformance      # SDK filters/shapes -> contract
npm run check-shape-coverage   # contract shape fields -> SDK schemas
npm run generate-shape-overlay # regenerate src/shapes/generatedOverlay.ts
```

### Tests

- **Unit** (`tests/unit/`): fast, offline, mock responses injected via the `fetchImpl` constructor option.
- **Integration** (`tests/integration/`): cassette record/replay via `tests/integration/harness.ts`; default runs replay `tests/cassettes/*.json` offline, and a missing cassette is a hard failure.
- **Cassette refresh:** `TANGO_REFRESH_CASSETTES=true` re-records against the live API (needs `TANGO_API_KEY`); `TANGO_USE_LIVE_API=true` bypasses cassettes. When an API change invalidates a cassette, refresh and commit it in the same PR.
- **Production smoke** (`tests/production/`): live-API-gated behind `TANGO_LIVE_TESTS=true` + `TANGO_API_KEY`; excluded from default runs and CI.
- Cassettes must never contain credentials — the harness refuses to serialize request headers; keep it that way.

### Release flow

1. Bump `version` in `package.json`.
2. Promote `## [Unreleased]` → a dated version section in `CHANGELOG.md`.
3. Open a PR to `main` and merge it.
4. Create a GitHub Release (tag + notes) — the publish workflow (`.github/workflows/publish.yml`) lints, tests, builds, and publishes to npm with provenance.

### Style

- camelCase methods and options on the client surface; snake_case filter params pass through to the API as-is unless an explicit alias remap is documented.
- American English everywhere.

## Where things live in this repo

| What | Where |
| ---- | ----- |
| SDK source | `src/` (client in `src/client.ts`, shaping pipeline in `src/shapes/`) |
| Shape presets | `src/config.ts` (`ShapeConfig`) |
| Vendored API contract + baselines | `contracts/` |
| Conformance gates + overlay generator + smoke scripts | `scripts/` |
| Tests | `tests/` (`unit/`, `integration/`, `cassettes/`, `production/`, `scripts/`, `webhooks/`) |
| User-facing docs | `docs/` (API reference, shapes, client, webhooks, developer guide) |
| Maintainer guide (gates, cassettes, release) | `docs/DEVELOPERS.md` |
| README | `README.md` |
| Changelog | `CHANGELOG.md` |
| CI + publish workflows | `.github/workflows/` |

## Context precedence (read order)

1. This `CLAUDE.md` — **start here**, then follow the pointers in "Where things live"
2. Files named in "Where things live" above
3. Community / language defaults (last resort)

Don't fall back to community defaults while local pointers remain unread.

## Contributing

External contributors: see the repo's GitHub issues for how to propose changes. Lint, typecheck, tests, and both conformance gates should pass locally before opening a PR.
