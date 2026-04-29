---
name: PascalCase JSON keys everywhere
description: Every key in every instruction tree (source TS, dist JSON, seed manifest, and runtime read paths) is PascalCase. Phase 1 renamed sources; Phase 2 split canonical PascalCase from a transitional camelCase compat snapshot; CI enforces both.
type: preference
---

# PascalCase JSON keys everywhere

**Status**: Enforced end-to-end (Phase 1 + Phase 2 complete; Phase 2c — drop the compat snapshot — is the remaining clean-up).
**Decision date**: 2026-04-25 (user direction during the `ProjectInstruction` migration session).
**CI guard**: `scripts/check-pascalcase-instruction-migration.mjs` blocks any regression at PR time. See `mem://architecture/instruction-dual-emit-phase-2b`.

Every key in every standalone-script `instruction.ts`, every emitted `dist/instruction.json`, every `seed-manifest.json`, and every runtime read of those files MUST be `PascalCase`. This is a **case-only** convention — semantics, value shapes, and string-literal unions (e.g. `"document_idle"`, `"glob"`) are unchanged. The only camelCase that may persist is at **third-party boundaries** (Chrome APIs like `chrome.cookies.get({ url, name })`, user-facing `ProjectManifest` export/import format) — those are explicitly carved out below.

---

## Phase history

| Phase | Scope | Status |
|---|---|---|
| **Phase 1** | Rename every key inside `standalone-scripts/*/src/instruction.ts` and the shared `ProjectInstruction<T>` type tree under `standalone-scripts/types/instruction/` to PascalCase. Withdraw the Q4 long-name draft (`injectionWorld`, `injectionRunAt`, `isImmediatelyInvokedFunction`, `injectInto`). | ✅ Complete |
| **Phase 2a** | Migrate every background-runtime consumer (`manifest-seeder`, `script-info-handler`, `injection-handler`, `default-project-seeder`, `builtin-script-guard`, `generate-seed-manifest.mjs`, `seed-manifest-types`) to read PascalCase keys. | ✅ Complete |
| **Phase 2b** | Split `compile-instruction.mjs` emit: `dist/instruction.json` (pure PascalCase, canonical) + `dist/instruction.compat.json` (pure camelCase, transitional snapshot for the lone unmigrated reader, the vite `copyProjectScripts` plugin). Bump `SeedManifest.SchemaVersion` to `2`; v1 (camelCase) refused at load. | ✅ Complete |
| **Phase 2c** | Migrate `vite.config.extension.ts`'s `copyProjectScripts` plugin to read PascalCase. Empty `COMPAT_READER_ALLOWLIST` in the CI guard. Stop emitting `instruction.compat.json` from `compile-instruction.mjs`. Remove `instruction.compat.json` from `check-standalone-dist.mjs` required-files lists. | ⏳ Pending |

---

## Canonical key mapping (legacy camelCase → PascalCase)

Source of truth is `standalone-scripts/types/instruction/**/*.ts`. The table below is the **authoritative** rename list — it must round-trip with the type files. If you add a new field to any instruction type, append it here.

### Top-level — `ProjectInstruction<T>`

| Legacy key | Canonical key | Notes |
|---|---|---|
| `schemaVersion` | `SchemaVersion` | `VersionString` — `"1.0"` etc. |
| `name` | `Name` | `Identifier` — project id |
| `displayName` | `DisplayName` | Human-readable label |
| `version` | `Version` | `VersionString` |
| `description` | `Description` | |
| `world` | `World` | `"MAIN" \| "ISOLATED"` (value casing unchanged — Chrome API contract) |
| `isGlobal` | `IsGlobal` | Optional |
| `dependencies` | `Dependencies` | `ReadonlyArray<Identifier>` |
| `loadOrder` | `LoadOrder` | |
| `seed` | `Seed` | `SeedBlock<T>` |
| `assets` | `Assets` | `AssetBundle` |
| `xPaths` | `XPaths` | Optional `XPathRegistry` |

### `SeedBlock<T>`

| Legacy key | Canonical key | Notes |
|---|---|---|
| `id` | `Id` | |
| `seedOnInstall` | `SeedOnInstall` | |
| `isRemovable` | `IsRemovable` | |
| `autoInject` | `AutoInject` | |
| `runAt` | `RunAt` | Value union `"document_start" \| "document_end" \| "document_idle"` unchanged — Chrome `chrome.scripting` vocabulary |
| `cookieBinding` | `CookieBinding` | `string` (cookie name) |
| `targetUrls` | `TargetUrls` | `ReadonlyArray<TargetUrl>` |
| `cookies` | `Cookies` | `ReadonlyArray<CookieSpec>` |
| `settings` | `Settings` | Project-specific `TSettings` — keys also PascalCase |
| `configSeedIds` | `ConfigSeedIds` | `Record<string, string>` — VALUES inside this map are user-chosen binding names (e.g. `"config"`, `"theme"`) and are intentionally lowercase; the **keys** of `ConfigSeedIds` are PascalCase but here the property is a free-form id map, so the lowercase entries `config`/`theme` are explicitly allowlisted in `LOWERCASE_KEY_ALLOWLIST` of `scripts/check-pascalcase-instruction-migration.mjs` |

### `TargetUrl`

| Legacy key | Canonical key |
|---|---|
| `pattern` | `Pattern` |
| `matchType` | `MatchType` (values `"glob" \| "regex" \| "exact"` unchanged) |

### `CookieSpec`

| Legacy key | Canonical key |
|---|---|
| `cookieName` | `CookieName` |
| `url` | `Url` |
| `role` | `Role` (values `"session" \| "refresh" \| "other"` unchanged) |
| `description` | `Description` |

### `AssetBundle`

| Legacy key | Canonical key |
|---|---|
| `css` | `Css` |
| `configs` | `Configs` |
| `scripts` | `Scripts` |
| `templates` | `Templates` |
| `prompts` | `Prompts` |

### `CssAsset`

| Legacy key | Canonical key |
|---|---|
| `file` | `File` |
| `inject` | `Inject` (value `"head"` unchanged) |

### `ConfigAsset`

| Legacy key | Canonical key |
|---|---|
| `file` | `File` |
| `key` | `Key` |
| `injectAs` | `InjectAs` |

### `ScriptAsset`

| Legacy key | Canonical key |
|---|---|
| `file` | `File` |
| `order` | `Order` |
| `configBinding` | `ConfigBinding` |
| `themeBinding` | `ThemeBinding` |
| `isIife` | `IsIife` |

### `TemplateAsset`

| Legacy key | Canonical key |
|---|---|
| `file` | `File` |
| `injectAs` | `InjectAs` |

### `PromptAsset`

| Legacy key | Canonical key |
|---|---|
| `file` | `File` |

### `XPathRegistry` (⚠️ Phase 1 carve-out — see "Known drift" below)

The XPath sub-tree under `XPaths.entries` / `XPaths.groups` still uses camelCase property names (`kind`, `name`, `value`, `description`, `wrappingXPath`, `entries`, `groups`, `relativeTo`). The intended PascalCase mapping is:

| Legacy key | Canonical key |
|---|---|
| `kind` | `Kind` |
| `name` | `Name` |
| `value` | `Value` |
| `description` | `Description` |
| `wrappingXPath` | `WrappingXPath` |
| `entries` | `Entries` |
| `groups` | `Groups` |
| `relativeTo` | `RelativeTo` |

These types live under `standalone-scripts/types/instruction/xpath/` and have not yet been renamed. Tracked under "Known drift" below.

### `SeedManifest` (`seed-manifest.json`)

| Legacy key | Canonical key |
|---|---|
| `schemaVersion` | `SchemaVersion` (pinned to `2` — v1 = pre-PascalCase, refused at load) |
| `projects` | `Projects` |

Each `Projects[]` entry is a slimmed `ProjectInstruction` and follows the same mapping above.

---

## Receivers, allowlists, and exemptions

### Files allowed to read `instruction.compat.json`

Maintained as `COMPAT_READER_ALLOWLIST` in `scripts/check-pascalcase-instruction-migration.mjs`. As of Phase 2b:

- `vite.config.extension.ts` — copyProjectScripts plugin (the lone runtime reader; Phase 2c migrates it).
- `scripts/compile-instruction.mjs` — emitter.
- `scripts/check-standalone-dist.mjs` — dist-shape validator.
- `scripts/generate-seed-manifest.mjs` — references the filename in comments only.
- `scripts/check-pascalcase-instruction-migration.mjs` — self-reference (this guard).

When Phase 2c lands, the runtime entry is removed and the allowlist holds only the four build-tooling files (which never *consume* the camelCase keys — they only know the filename).

### Variable names that flag CHECK C

`INSTRUCTION_RECEIVER_NAMES` in the same checker. Bare `manifest` is intentionally **excluded** — it collides with the user-facing `ProjectManifest` export schema (deliberately camelCase, see exemption below). To flag instruction-tree access on a `manifest` binding, rename the local variable to `instructionManifest`.

### Third-party / boundary exemptions (camelCase remains intentional)

| Boundary | Why camelCase stays |
|---|---|
| `chrome.cookies.get({ url, name, ... })` and other Chrome extension APIs | We don't own the contract. |
| `ProjectManifest` (user-facing project export/import JSON: `src/lib/project-exporter.ts`) | Stable user-facing schema; renaming would break every existing exported file. The CHECK C heuristic excludes the bare `manifest` receiver name to avoid false positives here. |
| `StoredScript` / `StoredProject` rows (chrome.storage.local persistence layer) | Separate workstream — their migration is independent and tracked separately. CHECK C only fires on receivers known to hold `instruction.json` parses, so storage-row reads (`script.runAt`, `meta.loadOrder`) are not flagged. |
| Logging UI rows (`Timestamp` SQL → `timestamp` JS) | Documented in `mem://architecture/logging-data-contract`. The remap happens at the SQL → UI boundary; nothing inside the instruction tree is touched. |

---

## Known drift (must be cleaned up)

1. **XPath sub-tree** under `standalone-scripts/types/instruction/xpath/` still uses camelCase. Mapping table above is the target. Add to `LEGACY_CAMEL_KEYS` in the CI guard once the types are renamed and consumers updated.
2. **`SeedBlock.ConfigSeedIds`** values are free-form lowercase ids (`config`, `theme`). The CI guard's `LOWERCASE_KEY_ALLOWLIST` covers these — when adding new binding names, update both the source `instruction.ts` and the allowlist together.

---

## How to apply (when adding/renaming a field)

1. Update the type file under `standalone-scripts/types/instruction/**/*.ts` first — PascalCase only.
2. Update every `standalone-scripts/<name>/src/instruction.ts` that uses the field.
3. Run `node scripts/compile-instruction.mjs standalone-scripts/<name>` for each affected project — the collision guard inside the compiler catches camelCase ↔ PascalCase clashes (e.g. both `Foo` and `foo` on the same node) and fails with a JSON path + rename hint.
4. Update every consumer that reads the field. CHECK C of the migration guard will surface anything missed when the receiver is named `instruction*` / `projectInstruction`.
5. If the new field name introduces a fresh **distinctive** camelCase form (one that doesn't already mean something on a storage row), add it to `LEGACY_CAMEL_KEYS` in `scripts/check-pascalcase-instruction-migration.mjs` so future regressions are caught.
6. Run `node scripts/check-pascalcase-instruction-migration.mjs` locally before pushing — it returns in <1s and blocks the PR if any of the three checks fail.

## Pre-merge sanity command

```bash
node scripts/check-pascalcase-instruction-migration.mjs && \
node scripts/compile-instruction.mjs standalone-scripts/marco-sdk && \
node scripts/compile-instruction.mjs standalone-scripts/macro-controller && \
node scripts/compile-instruction.mjs standalone-scripts/xpath && \
node scripts/compile-instruction.mjs standalone-scripts/payment-banner-hider && \
node scripts/generate-seed-manifest.mjs
```

All five must exit 0. CI runs them in the `pascalcase-instruction-migration` preflight job and as part of `build:extension`, blocking merge on failure.

## Supersedes

- `standalone-scripts/types/instruction/00-readme.md` Q4 (long camelCase names: `injectionWorld`, `injectionRunAt`, `isImmediatelyInvokedFunction`, `injectInto`). Q4 is **withdrawn** in favour of this PascalCase rule.
- The original camelCase ↔ PascalCase dual-key emit (Phase 1, single `instruction.json` with both spellings merged on every node). Replaced by Phase 2b's two-physical-file split.
