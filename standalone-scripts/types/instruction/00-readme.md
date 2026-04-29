# Global Instruction Types — Phase 1 (PascalCase) Landed

**Status**: 🟢 Phase 1 complete (2026-04-25). Every standalone-script `instruction.ts` now imports `ProjectInstruction<TSettings>` from `./project-instruction.ts` and uses **PascalCase keys everywhere**. The Q4 long-camelCase draft (`injectionWorld`, `injectionRunAt`, `isImmediatelyInvokedFunction`, `injectInto`) is **withdrawn** — superseded by `mem://standards/pascalcase-json-keys`.

`scripts/compile-instruction.mjs` runs in **dual-emit mode** during the transition: every PascalCase key (`Name`, `World`, `RunAt`, `IsIife`, …) is mirrored as a camelCase alias (`name`, `world`, `runAt`, `isIife`, …) on every nested object. The 47 legacy consumers in `src/background/`, `src/components/options/`, `src/options/`, `src/popup/`, `src/lib/`, and `scripts/generate-seed-manifest.mjs` therefore keep working unchanged.

**Phase 2 (next loops)** rewrites every consumer to read the canonical PascalCase keys, then drops the dual-emit aliases (replaces `addCamelCaseAliases(obj)` with `obj`) and adds a one-shot `chrome.storage.local` migrator that PascalCase-rewrites already-persisted projects on extension upgrade.

**Target consumers**: every standalone script (`marco-sdk`, `xpath`, `macro-controller`, `payment-banner-hider`, `lovable-common`, `lovable-owner-switch`, `lovable-user-add`).
**Goal**: replace each project's local `ProjectInstruction` interface, ad-hoc string unions (`"MAIN" | "ISOLATED"`, `"glob" | "regex"`, `"document_idle" | "document_end"`), and inline array element types with a single shared, strongly-typed contract. **Phase 1 done.**

## Conventions enforced in this folder

1. **One type per file** — file name = type name in `kebab-case.ts`.
2. **`type` only** — never `interface` (project preference: stick to one keyword).
3. **No `unknown`, no `any`** — every leaf is either a concrete type, an enum, or `T` generic.
4. **No in-place definitions** — array element types, function parameter shapes, and union members all live in their own files and are imported by name.
5. **Full names, no abbreviations** — `cookieName` not `ckName`, `injectionWorld` not `world`, `compileFunction` not `compileFn`.
6. **Enums for closed string unions** — `InjectionWorld`, `InjectionRunAt`, `XPathKind`, `MatchType`, `AssetInjectTarget`. (See `enums/`.)

## File layout

```
standalone-scripts/types/instruction/
├── 00-readme.md                          ← this file
├── enums/
│   ├── injection-world.ts
│   ├── injection-run-at.ts
│   ├── match-type.ts
│   ├── xpath-kind.ts
│   └── asset-inject-target.ts
├── primitives/
│   ├── version-string.ts
│   ├── url-pattern.ts
│   └── identifier.ts
├── xpath/
│   ├── xpath-direct-entry.ts
│   ├── xpath-relative-entry.ts
│   ├── xpath-entry.ts                    ← discriminated union
│   ├── xpath-group.ts
│   └── xpath-registry.ts
├── assets/
│   ├── css-asset.ts
│   ├── config-asset.ts
│   ├── script-asset.ts
│   ├── template-asset.ts
│   ├── prompt-asset.ts
│   └── asset-bundle.ts
├── seed/
│   ├── target-url.ts
│   ├── cookie-binding.ts
│   ├── cookie-spec.ts
│   ├── empty-settings.ts
│   └── seed-block.ts
├── dependency/
│   └── project-dependency.ts
└── project-instruction.ts                ← top-level type that composes everything
```

## Decisions (locked 2026-04-24)

| # | Question | Decision | Rationale (full version in spec §5) |
|---|----------|----------|--------------------------------------|
| Q1 | `enum` vs. `as const` | **`export const enum`** with explicit string members | Zero runtime cost, no magic strings at call sites, matches files already shipped in `enums/` |
| Q2 | `xpaths` optional or required | **Optional** (`xpaths?: XPathRegistry`) | `marco-sdk` and `payment-banner-hider` have zero XPaths; sentinel value would violate "no in-place definitions" |
| Q3 | `EmptySettings` alias or inline | **Named alias** in `seed/empty-settings.ts` | Reviewer rule "no in-place definitions"; one grep target lists every settings-less script |
| Q4 | Long names everywhere | **Yes** — `injectionWorld`, `injectionRunAt`, `isImmediatelyInvokedFunction`, `injectInto` | Reviewer rule "no FN-style abbreviations"; avoids collision with Chrome's own `runAt`; ESLint `id-denylist` will block the old names after migration |
| Q5 | Runtime `StandaloneScript` base class | 🟡 **Deferred** — does not block this build-out | Will be designed after `PaymentBannerHider` class rewrite (plan 0.11) provides a reference implementation |

The 19-file build-out is now unblocked. Migration order is tracked in `plan.md` Priority 0 (items 0.2–0.6).

---

## Migration checklist (per standalone script)

Run **in order**. Do not skip steps — each step's grep target is the gate for the next.

1. **Inventory the local types**
   - `rg -n "interface ProjectInstruction|type ProjectInstruction" standalone-scripts/<scriptName>/`
   - `rg -n "\"MAIN\"\\s*\\|\\s*\"ISOLATED\"|\"ISOLATED\"\\s*\\|\\s*\"MAIN\"" standalone-scripts/<scriptName>/`
   - `rg -n "\"document_(idle|end|start)\"" standalone-scripts/<scriptName>/`
   - `rg -n "\"glob\"\\s*\\|\\s*\"regex\"|\"regex\"\\s*\\|\\s*\"glob\"" standalone-scripts/<scriptName>/`

2. **Replace the local `ProjectInstruction`** with the shared import:
   ```ts
   import type { ProjectInstruction } from "../../types/instruction/project-instruction";
   ```
   Delete the local interface/type once nothing references it.

3. **Replace inline string unions with enums** from `enums/`:
   - `"MAIN" | "ISOLATED"` → `InjectionWorld`
   - `"document_idle" | "document_end" | "document_start"` → `InjectionRunAt`
   - `"glob" | "regex"` → `MatchType`
   - `"direct" | "relative"` → `XPathKind`
   - asset target literals → `AssetInjectTarget`

4. **Adopt long field names** (Q4):
   - `world` → `injectionWorld`
   - `runAt` → `injectionRunAt`
   - `iife` → `isImmediatelyInvokedFunction`
   - `target` (on assets) → `injectInto`

5. **Apply `EmptySettings` (Q3)** wherever a script has no user-tunable settings:
   ```ts
   import type { EmptySettings } from "../../types/instruction/seed/empty-settings";
   const instruction: ProjectInstruction<EmptySettings> = { … };
   ```
   Never inline `Record<string, never>` at the callsite.

6. **Verify** — all four greps below MUST return zero hits in the migrated script's folder before closing the migration ticket.

---

## Grep targets (zero-hit gates)

These commands must return **no matches** under `standalone-scripts/<scriptName>/` after migration. CI will run them repo-wide once every script is migrated; until then they are the per-script acceptance test.

### 1. `EmptySettings` adoption — find inlined empty-settings types

```bash
# Any script that still inlines Record<string, never> instead of importing EmptySettings
rg -n "Record<\\s*string\\s*,\\s*never\\s*>" standalone-scripts/<scriptName>/

# Any script that inlines `{}` as the settings generic (also banned)
rg -n "ProjectInstruction<\\s*\\{\\s*\\}\\s*>" standalone-scripts/<scriptName>/
```
Expected: **0 hits**. Replacement: `import type { EmptySettings }` + `ProjectInstruction<EmptySettings>`.

### 2. Deprecated short field names (Q4)

```bash
# Short names on instruction / asset / seed objects
rg -n "\\b(world|runAt|iife|target)\\s*:" standalone-scripts/<scriptName>/src/
```
Expected: **0 hits** for these specific keys on instruction-shaped objects. Replacements:
- `world:` → `injectionWorld:`
- `runAt:` → `injectionRunAt:`
- `iife:` → `isImmediatelyInvokedFunction:`
- `target:` (on assets) → `injectInto:`

> ⚠️ `target:` is a common word — review hits manually and only rewrite the ones on `*Asset` objects. Do **not** touch `event.target`, DOM `target`, or unrelated build-tool `target` fields.

### 3. Inline string unions that should be enums

```bash
rg -n "\"MAIN\"\\s*\\|\\s*\"ISOLATED\"|\"ISOLATED\"\\s*\\|\\s*\"MAIN\"" standalone-scripts/<scriptName>/
rg -n "\"document_(idle|end|start)\"\\s*\\|" standalone-scripts/<scriptName>/
rg -n "\"glob\"\\s*\\|\\s*\"regex\"|\"regex\"\\s*\\|\\s*\"glob\"" standalone-scripts/<scriptName>/
rg -n "\"direct\"\\s*\\|\\s*\"relative\"|\"relative\"\\s*\\|\\s*\"direct\"" standalone-scripts/<scriptName>/
```
Expected: **0 hits**. Replacements: import the matching enum from `enums/` and use the enum member.

### 4. Local `ProjectInstruction` redefinitions

```bash
rg -n "^(export\\s+)?(interface|type)\\s+ProjectInstruction\\b" standalone-scripts/<scriptName>/
```
Expected: **0 hits**. The shared type from `standalone-scripts/types/instruction/project-instruction.ts` is the only legal definition.

---

## Repo-wide post-migration gate

Once **every** script is migrated, the same four greps must return zero hits across the whole `standalone-scripts/` tree (excluding `standalone-scripts/types/`):

```bash
rg -n "Record<\\s*string\\s*,\\s*never\\s*>" standalone-scripts/ -g '!standalone-scripts/types/**'
rg -n "\\b(world|runAt|iife)\\s*:"            standalone-scripts/ -g '!standalone-scripts/types/**'
rg -n "^(export\\s+)?(interface|type)\\s+ProjectInstruction\\b" standalone-scripts/ -g '!standalone-scripts/types/**'
rg -n "\"MAIN\"\\s*\\|\\s*\"ISOLATED\"" standalone-scripts/ -g '!standalone-scripts/types/**'
```

At that point, ESLint's `id-denylist` rule for `world` / `runAt` / `iife` / inline `target` (on instruction objects) becomes the permanent enforcement layer and these greps move into CI.
