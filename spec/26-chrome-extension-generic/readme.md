# Generic Chrome Extension Blueprint — README

**Version:** 1.4.0
**Updated:** 2026-04-24
**Status:** Active
**AI Confidence:** Production-Ready (intent) / Medium (body — some sections still placeholders)
**Ambiguity:** None

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## What this is

A **drop-in, AI-portable foundation** for building production-quality Chrome MV3 extensions. Any AI agent (or human) who reads only this folder can scaffold, build, lint, package, and ship an extension without referring to any other project, codebase, or memory.

---

## Table of contents

1. [What this is](#what-this-is)
2. [Quick start for AI agents](#quick-start-for-ai-agents)
3. [Folder map](#folder-map)
4. [For humans: one-minute summary](#for-humans-one-minute-summary)
5. [Where the 10-step checklist lives](#where-the-10-step-checklist-lives) — file path, anchor, end boundary, full Steps 1–10 excerpt
6. [All verification commands (Steps 1–10) — quick copy/paste](#all-verification-commands-steps-110-quick-copypaste)
7. [Cross-references](#cross-references)
8. [Troubleshooting FAQ — checklist verification failures](#troubleshooting-faq-checklist-verification-failures)
9. [Validate this README](#validate-this-readme)
10. [Generification policy](#generification-policy)

> **New here?** Jump straight to **§5 — [Where the 10-step checklist lives](#where-the-10-step-checklist-lives)** for the full Steps 1–10 excerpt, or **§6 — [All verification commands](#all-verification-commands-steps-110-quick-copypaste)** for a single copy/paste block. Everything else on this page is context for those two sections.

---

## Quick start for AI agents

### 1. Open the onboarding prompt

**File:** `13-ai-onboarding-prompt.md`

This is the **single entry point**. It contains:

- **The one-prompt instruction** — a copy-verbatim block you paste into a fresh AI session.
- **Five required input tokens** — `<PROJECT_NAME>`, `<ROOT_NAMESPACE>`, `<VERSION>`, `<HOST_MATCHES>`, `<EXTENSION_ID>` — that the human must supply.
- **Eight operating rules** — sequential execution, templates-as-law, zero warnings, CODE-RED enforcement, no-retry policy, dark-only theme, and mandatory verification.
- **The 10-step build checklist** — the exact order of operations from scaffold → tokenise → install → lint → AppError → platform adapter → message relay → storage → UI shells → build/package.

### 2. Follow the 10-step checklist

Each step in `13-ai-onboarding-prompt.md` lists:

| Step | What you do | Source of truth | Verification command |
|------|-------------|-----------------|----------------------|
| 1 | Scaffold repository layout | `02-folder-and-build/01-repository-layout.md` | `tree -L 3 -I node_modules` |
| 2 | Copy & tokenise templates | `12-templates/00-overview.md` + all `*.template.*` | `rg "<(PROJECT_NAME\|ROOT_NAMESPACE\|VERSION\|HOST_MATCHES\|EXTENSION_ID)>" -l` returns empty |
| 3 | Install dependencies | `02-folder-and-build/05-package-json-scripts.md` | `npm ls --depth=0` |
| 4 | Wire TS + ESLint (zero warnings) | `03-typescript-and-linter/` | `npm run lint` (0 warnings, 0 errors); `npm run typecheck` |
| 5 | Implement `AppError` + logger | `07-error-management/` | `npm test -- error-codes` passes; `rg "throw new Error"` returns empty |
| 6 | Implement platform adapter | `04-architecture/04-platform-adapter.md` | `rg "\\bchrome\\." src/ -g '!src/platform/**'` returns empty |
| 7 | Implement message relay | `04-architecture/03-message-relay.md` | `npm test -- messaging` passes |
| 8 | Implement storage tier(s) | `05-storage-layers/` | `npm test -- storage` passes; `npm run check:codered` exits zero |
| 9 | Build UI shells | `06-ui-and-design-system/` | `rg "#[0-9a-fA-F]{3,8}\\b" src/ -g '!**/*.css'` returns empty |
| 10 | Build, package, verify | `11-cicd-and-release/` | `npm run validate && npm run lint && npm run typecheck && npm test && npm run build && npm run package` all pass; Chrome load-unpacked works |

### 3. Read sub-folders in numeric order

The 11 numbered sections (`02` through `12`) are **dependency-ordered**. Read them sequentially — each builds on the previous.

---

## Folder map

| # | Folder | What's inside |
|---|--------|---------------|
| `00` | `00-overview.md` | This README — index, scoring, how to use |
| `01` | `01-fundamentals.md` | MV3 invariants, lifecycle, boundaries |
| `02` | `02-folder-and-build/` | Repository layout, tsconfig matrix, Vite, manifest, packaging |
| `03` | `03-typescript-and-linter/` | Strict TS, ESLint flat-config, naming, zero-warnings policy |
| `04` | `04-architecture/` | Lifecycle, three-world model, message relay, namespace system, injection pipeline |
| `05` | `05-storage-layers/` | SQLite + IndexedDB + chrome.storage + localStorage tiers |
| `06` | `06-ui-and-design-system/` | Design tokens, dark-only theme, component library, controller UI, notifications |
| `07` | `07-error-management/` | AppError model, error code registry, file-path CODE-RED rule, logger |
| `08` | `08-auth-and-tokens/` | Bearer-token bridge, readiness gate, no-retry policy, host-permission failures |
| `09` | `09-injection-and-host-access/` | Permissions, restricted schemes, tab eligibility, cooldowns, token seeder |
| `10` | `10-testing-and-qa/` | Vitest, Playwright MV3, snapshot testing, non-regression rules |
| `11` | `11-cicd-and-release/` | Validation scripts, version policy, release ZIP contract |
| `12` | `12-templates/` | Copy-paste ready manifests, tsconfigs, vite/eslint configs, etc. |
| `13` | `13-ai-onboarding-prompt.md` | **Single prompt + 10-step checklist for a fresh AI** |
| `97` | `97-acceptance-criteria.md` | ~65 testable acceptance criteria |
| `98` | `98-changelog.md` | Version history |
| `99` | `99-consistency-report.md` | Structural health report |

---

## For humans: one-minute summary

If you want a new Chrome extension built from this blueprint, do this:

1. **Open `13-ai-onboarding-prompt.md`**.
2. **Fill in the five tokens** at the bottom of the one-prompt instruction (`<PROJECT_NAME>`, `<ROOT_NAMESPACE>`, `<VERSION>`, `<HOST_MATCHES>`, `<EXTENSION_ID>`).
3. **Copy the entire one-prompt block** and paste it into any AI coding assistant (Claude, GPT-4, Cursor, etc.).
4. **The AI follows the 10-step checklist** inside that same file. Each step has a verification command — the AI runs it and confirms it passes before continuing.
5. **At step 10**, the AI builds a ZIP you load into Chrome via `chrome://extensions → Load unpacked`.

That's it. The AI never needs to ask you questions unless a verification fails or a token is missing.

---

## Where the 10-step checklist lives

**File:** `13-ai-onboarding-prompt.md`

**Anchor:** `## The 10-Step Build Checklist` (line ~118)

**What it covers:** Steps 1–10 span from repository scaffolding through build, package, and Chrome load-unpacked verification. Each step includes a source-of-truth reference, detailed instructions, and a mandatory verification command.

**Ends at:** `## Stop conditions` (line ~285) — the section immediately following the checklist that defines the four situations when the AI may stop and ask for human guidance.

**Full checklist excerpt (Steps 1–10, copy-paste from `13-ai-onboarding-prompt.md`):**

> 📋 **Tip:** Copy everything between the `▼ CHECKLIST STARTS HERE ▼` and `▲ CHECKLIST ENDS HERE ▲` markers below. The HTML comments (`<!-- BEGIN/END … -->`) mark the same boundary for scripts.

<!-- BEGIN: 10-Step Build Checklist excerpt — keep in sync with 13-ai-onboarding-prompt.md -->

> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> ▼ **CHECKLIST STARTS HERE** ▼ — copy from the next line through the matching `▲ CHECKLIST ENDS HERE ▲` marker.
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
>
> ## The 10-Step Build Checklist
>
> Execute in order. Do not skip, parallelise, or reorder.
>
> ### Step 1 — Scaffold the repository layout
>
> **Source of truth:** `02-folder-and-build/01-repository-layout.md`
>
> Create the project root, all sub-folders (`src/`, `src/background/`, `src/content/`, `src/options/`, `src/popup/`, `src/sdk/`, `src/messaging/`, `src/storage/`, `src/auth/`, `src/types/`, `src/config/`, `tests/`, `scripts/`, `public/`), and empty `.gitkeep` files where the spec requires.
>
> **Verification:** `tree -L 3 -I node_modules` matches the layout diagram in `02-folder-and-build/01-repository-layout.md`.
>
> ### Step 2 — Copy and tokenise the templates
>
> **Source of truth:** `12-templates/00-overview.md` and every `*.template.*` file in that folder.
>
> Copy each template to its destination path, performing exactly five global substitutions: `<PROJECT_NAME>`, `<ROOT_NAMESPACE>`, `<VERSION>`, `<HOST_MATCHES>`, `<EXTENSION_ID>`. Strip the `.template` infix from filenames. Preserve all other content byte-for-byte.
>
> **Verification:** `rg "<(PROJECT_NAME|ROOT_NAMESPACE|VERSION|HOST_MATCHES|EXTENSION_ID)>" -l` returns no matches anywhere in the project.
>
> ### Step 3 — Install dependencies
>
> **Source of truth:** `02-folder-and-build/05-package-json-scripts.md` and `12-templates/package.json.template`.
>
> Run `npm install` (or `bun install` if the spec specifies bun). Do not add, remove, or upgrade any dependency outside the spec's pinned versions.
>
> **Verification:** `npm ls --depth=0` shows every dependency from `package.json` resolved with no `UNMET` or `extraneous` warnings.
>
> ### Step 4 — Wire TypeScript and ESLint with zero warnings
>
> **Source of truth:** `03-typescript-and-linter/01-typescript-rules.md`, `03-typescript-and-linter/02-eslint-config.md`, `03-typescript-and-linter/05-zero-warnings-policy.md`.
>
> Confirm `tsconfig.app.json`, `tsconfig.sdk.json`, `tsconfig.node.json`, `eslint.config.js`, and `.prettierrc` are in place from Step 2. The `no-bare-fs-error` blueprint rule must be enabled at severity `error`.
>
> **Verification:** `npm run lint` exits zero with `0 warnings, 0 errors` and `npm run typecheck` exits zero on all three tsconfigs.
>
> ### Step 5 — Implement `AppError` and the namespace logger
>
> **Source of truth:** `07-error-management/01-error-model.md`, `07-error-management/02-error-code-registry.md`, `07-error-management/03-file-path-error-rule.md`, `07-error-management/04-namespace-logger.md`.
>
> Place `AppError` at `src/types/error-model.ts` (verbatim from the template). Place the logger at `src/diagnostics/namespace-logger.ts` and attach it to `window.<ROOT_NAMESPACE>.Logger` in every entry point. Seed the error code registry table from `02-error-code-registry.md` into `tests/error-codes.spec.ts` as a guard test.
>
> **Verification:** `npm test -- error-codes` passes; `rg "throw new Error\(" src/` returns zero matches (only `AppError` may be thrown).
>
> ### Step 6 — Implement the platform adapter and Chrome adapter
>
> **Source of truth:** `04-architecture/04-platform-adapter.md` and `12-templates/{platform-adapter,chrome-adapter}.template.ts`.
>
> Place the typed `PlatformAdapter` interface at `src/platform/platform-adapter.ts` and the Chrome implementation at `src/platform/chrome-adapter.ts`. Every `chrome.*` API used in the project MUST be reached through this adapter.
>
> **Verification:** `rg "\bchrome\." src/ -g '!src/platform/**'` returns zero matches.
>
> ### Step 7 — Implement the three-world message relay
>
> **Source of truth:** `04-architecture/02-three-world-model.md`, `04-architecture/03-message-relay.md`, and `12-templates/message-client.template.ts`.
>
> Place the relay client at `src/messaging/client.ts`, the router at `src/messaging/router.ts`, and the page-bridge for the MAIN world at `src/sdk/page-bridge.ts`. Define every message type via the `defineMessage(...)` factory — no inline string types.
>
> **Verification:** `npm test -- messaging` passes; a manual postMessage round-trip from MAIN → ISOLATED → background → ISOLATED → MAIN completes in under 100 ms in the dev build.
>
> ### Step 8 — Implement the chosen storage tier(s)
>
> **Source of truth:** `05-storage-layers/00-overview.md` and the per-tier files (`02-sqlite-in-background.md`, `03-sqlite-schema-conventions.md`, `04-indexeddb-page-cache.md`, `05-chrome-storage-local.md`, `06-localstorage-bridges.md`, `07-self-healing-and-migrations.md`).
>
> Use the tier matrix in `01-storage-tier-matrix.md` to pick the minimum tiers required. SQLite-in-background is the default for any data that must survive cleanup; IndexedDB for page-side caches; `chrome.storage.local` for small typed config; localStorage TTL bridges only for ≤ 10-min credential hand-offs to the MAIN world.
>
> **Verification:** `npm test -- storage` passes; `npm run check:codered` (the `scripts/check-error-rule.mjs` validator) exits zero.
>
> ### Step 9 — Build the UI shells (Options, Popup, optional injected controller)
>
> **Source of truth:** `06-ui-and-design-system/05-options-page-shell.md`, `06-ui-and-design-system/06-popup-shell.md`, `06-ui-and-design-system/07-injected-controller-ui.md`, `06-ui-and-design-system/01-design-tokens.md`, `06-ui-and-design-system/02-dark-only-theme.md`.
>
> Place `index.css` (HSL tokens) and `tailwind.config.ts` from Step 2. Build the Options page at `src/options/`, the Popup at `src/popup/`, and (if the project ships an injected controller) the controller UI at `src/sdk/ui/`. All colours come from semantic tokens — no hex literals in components.
>
> **Verification:** `rg "#[0-9a-fA-F]{3,8}\b" src/ -g '!**/*.css' -g '!**/*.md'` returns zero matches; the Options page renders with the dark theme on first load.
>
> ### Step 10 — Build, package, and verify install
>
> **Source of truth:** `11-cicd-and-release/03-build-pipeline.md`, `11-cicd-and-release/04-release-zip-contract.md`, `02-folder-and-build/06-packaging-and-zip.md`.
>
> Run, in order:
>
> ```bash
> npm run validate     # all check-*.mjs scripts
> npm run lint         # zero warnings policy
> npm run typecheck    # all tsconfigs
> npm test             # vitest unit suite
> npm run build        # vite production build
> npm run package      # zip with the release contract
> ```
>
> Then in Chrome: open `chrome://extensions`, enable Developer Mode, click **Load unpacked** and select `dist/`. Confirm: no errors badge, icon appears, popup shows the dark-themed shell, options page renders the navigation, and the background service worker is `active`.
>
> **Verification:** `npm run validate:zip` exits zero and the in-Chrome checklist above passes.
>
> ---
>
> *(End of checklist — the next section in `13-ai-onboarding-prompt.md` is `## Stop conditions`.)*
>
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
> ▲ **CHECKLIST ENDS HERE** ▲ — stop copying at the previous line. Everything below this marker is README context, not part of the checklist.
> ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<!-- END: 10-Step Build Checklist excerpt -->

---

## All verification commands (Steps 1–10) — quick copy/paste

Run these in order from the project root. Each block corresponds to one step in the 10-step checklist. Every command must exit zero / return empty before moving to the next.

```bash
# Step 1 — Repository layout matches the spec diagram
tree -L 3 -I node_modules

# Step 2 — All five canonical tokens are fully resolved (must return empty)
rg "<(PROJECT_NAME|ROOT_NAMESPACE|VERSION|HOST_MATCHES|EXTENSION_ID)>" -l

# Step 3 — Dependencies installed cleanly (no UNMET / extraneous)
npm ls --depth=0

# Step 4 — Lint (zero warnings, zero errors) and typecheck (all tsconfigs)
npm run lint
npm run typecheck

# Step 5 — Error model in place (test passes; no bare `throw new Error` in src/)
npm test -- error-codes
rg "throw new Error\(" src/

# Step 6 — No direct chrome.* API calls outside the platform adapter
rg "\bchrome\." src/ -g '!src/platform/**'

# Step 7 — Three-world message relay tests pass
npm test -- messaging

# Step 8 — Storage tests pass and CODE-RED file/path rule is satisfied
npm test -- storage
npm run check:codered

# Step 9 — No hex colour literals in src/ components (semantic tokens only)
rg "#[0-9a-fA-F]{3,8}\b" src/ -g '!**/*.css' -g '!**/*.md'

# Step 10 — Full build + package + ZIP contract validation
npm run validate
npm run lint
npm run typecheck
npm test
npm run build
npm run package
npm run validate:zip
# Then: chrome://extensions → Developer Mode → Load unpacked → select dist/
```

**Pass criteria:** Every `npm` command exits `0`. Every `rg` command returns no output. `npm ls` shows no `UNMET` or `extraneous` warnings. Chrome `Load unpacked` shows no errors badge.

If any command fails, jump to the **Troubleshooting FAQ** section above.

---

## Cross-references

| Reference | Location |
|----------|----------|
| Spec authoring guide | `../01-spec-authoring-guide/00-overview.md` |
| TypeScript standards | `../02-coding-guidelines/02-typescript/00-overview.md` |
| Error management foundations | `../03-error-manage/00-overview.md` |
| Database conventions | `../04-database-conventions/00-overview.md` |
| Design system foundations | `../07-design-system/00-overview.md` |

---

## Troubleshooting FAQ — checklist verification failures

The 10-step checklist in `13-ai-onboarding-prompt.md` has a verification command after every step. When one fails, use this guide before asking for help.

### Step 2 — token substitution still shows unmatched tokens

**Symptom:** `rg "<(PROJECT_NAME|ROOT_NAMESPACE|VERSION|HOST_MATCHES|EXTENSION_ID)>" -l` returns files.

**Fix:**
1. Re-run the substitution on every `.template.*` file before renaming.
2. Check for tokens inside comments or string literals you may have skipped.
3. Ensure the regex covers all five tokens — no abbreviations or alternate spellings.

### Step 4 — `npm run lint` shows warnings

**Symptom:** Lint exits non-zero or reports > 0 warnings.

**Fix:**
1. Do not add `// eslint-disable` comments. Fix the root cause.
2. If the warning is from a template file you haven't customised yet, the template itself may need a tweak — check `12-templates/00-overview.md` for known template issues.
3. Run `npm run lint -- --fix` only if the auto-fix does not introduce new warnings.

### Step 5 — `rg "throw new Error"` returns matches

**Symptom:** Bare `throw new Error(...)` still exists outside test files.

**Fix:**
1. Replace every bare `throw new Error` with `throw AppError.from(...)` or `AppError.fromFsFailure(...)` for file/path errors.
2. Check `src/` only — `tests/` and `scripts/` may use bare errors intentionally.
3. Re-run `rg "throw new Error" src/` to confirm zero matches.

### Step 6 — direct `chrome.*` API calls outside `src/platform/`

**Symptom:** `rg "\bchrome\." src/ -g '!src/platform/**'` returns matches.

**Fix:**
1. Move every direct `chrome.*` call into `src/platform/chrome-adapter.ts`.
2. Expose it through the `PlatformAdapter` interface in `src/platform/platform-adapter.ts`.
3. Replace the call site with an adapter method invocation.

### Step 8 — `npm run check:codered` fails

**Symptom:** The CODE-RED validator reports missing `path` or `missing` fields.

**Fix:**
1. Every FS / storage / DB / OPFS / IDB error must use `AppError.fromFsFailure({ path, missing, reason })`.
2. Check that `path` is the exact resource path, `missing` is a single token describing what was absent (e.g. `file`, `table`, `key`), and `reason` is a human-readable sentence.
3. Re-run `npm run check:codered` until it exits zero.

### Step 10 — Chrome `Load unpacked` shows errors

**Symptom:** The extension loads with a red error badge, or the popup/options page is blank.

**Fix:**
1. Check `chrome://extensions` for the error text. If it mentions CSP, verify `manifest.json` `content_security_policy` matches the Vite build output hashes.
2. If the popup is blank, open the popup's DevTools (right-click → Inspect) and check the Console for missing module errors — usually a path alias or import resolution issue.
3. If the options page fails, verify `src/options/options.html` points to the correct built JS/CSS paths.
4. If the background service worker shows errors, go to the extension's detail page → Service Worker → Inspect, and check for `AppError` or adapter initialization failures.

---

### If a step fails — diagnostic commands per step

When a verification fails, run the matching diagnostic block below to gather the exact logs and signals you need before changing code or asking for help.

#### Step 3 — Dependency install fails

```bash
# Show full npm error log path and last error
npm install --loglevel=verbose 2>&1 | tail -80
cat ~/.npm/_logs/$(ls -t ~/.npm/_logs/ | head -1)

# Check Node and npm versions match the spec
node --version
npm --version

# Check for lockfile drift
git status package-lock.json
```

#### Step 4 — Lint or typecheck fails

```bash
# Full lint output with rule names and file paths
npm run lint -- --format=stylish 2>&1 | tee /tmp/lint.log

# Typecheck per tsconfig (find which one fails)
npx tsc --noEmit -p tsconfig.app.json
npx tsc --noEmit -p tsconfig.sdk.json
npx tsc --noEmit -p tsconfig.node.json

# Verify the no-bare-fs-error rule is wired
rg "no-bare-fs-error" eslint.config.js
```

#### Step 5 — `AppError` / error-codes test fails

```bash
# Run the specific test with full output
npm test -- error-codes --reporter=verbose

# Find every bare throw in src/ with file + line
rg -n "throw new Error\(" src/

# Confirm AppError is exported correctly
rg -n "export.*class AppError" src/types/error-model.ts
```

#### Step 6 — Direct `chrome.*` usage outside the platform adapter

```bash
# List every offending call with file + line
rg -n "\bchrome\." src/ -g '!src/platform/**'

# Confirm the adapter exists and exports the expected API
rg -n "export" src/platform/platform-adapter.ts
rg -n "export" src/platform/chrome-adapter.ts
```

#### Step 7 — Message relay tests fail

```bash
# Run with verbose reporter to see which assertion failed
npm test -- messaging --reporter=verbose

# Check that all three world entry points exist
test -f src/messaging/client.ts && echo "OK client" || echo "MISSING client"
test -f src/messaging/router.ts && echo "OK router" || echo "MISSING router"
test -f src/sdk/page-bridge.ts && echo "OK page-bridge" || echo "MISSING page-bridge"

# Confirm no inline message strings (must use defineMessage factory)
rg -n "chrome.runtime.sendMessage\(\s*\{\s*type:\s*['\"]" src/
```

#### Step 8 — Storage tests or CODE-RED check fails

```bash
# Storage test failures with verbose output
npm test -- storage --reporter=verbose

# CODE-RED validator full report
npm run check:codered 2>&1 | tee /tmp/codered.log

# Find FS/storage error sites missing path/missing fields
rg -n "AppError" src/ | rg -v "fromFsFailure|path:|missing:"
```

#### Step 9 — Hex colour literals found in components

```bash
# List every hex colour with file + line
rg -n "#[0-9a-fA-F]{3,8}\b" src/ -g '!**/*.css' -g '!**/*.md'

# Confirm semantic tokens exist in index.css
rg -n "^\s*--" src/index.css | head -30
```

#### Step 10 — Build, package, or Chrome load fails

```bash
# Build output (tee for inspection)
npm run build 2>&1 | tee /tmp/build.log
tail -50 /tmp/build.log

# Inspect the produced manifest in dist/
cat dist/manifest.json | head -40

# Validate the ZIP contract
npm run validate:zip 2>&1 | tee /tmp/zip.log

# Inspect the built bundle for chunk size + entry points
ls -lh dist/
ls -lh dist/assets/
```

**In Chrome (Step 10 runtime errors):**

1. `chrome://extensions` → toggle Developer Mode → click **Errors** on the extension card → screenshot the full stack.
2. Background service worker: extension card → **Service worker** link → DevTools → Console + Network tabs.
3. Popup: right-click the toolbar icon → **Inspect popup** → Console.
4. Options page: open it, then `Cmd/Ctrl+Shift+I` → Console + Network.
5. Content script: open a target tab matching `<HOST_MATCHES>` → DevTools → Console → filter by your `<ROOT_NAMESPACE>` log prefix.

**General escalation rule:** Capture the exact command, exit code, last 50 lines of output, and (for Chrome runtime errors) a screenshot of the `chrome://extensions` Errors panel. Only then ask for human guidance per the **Stop conditions** in `13-ai-onboarding-prompt.md`.

---



## Validate this README

Run these commands from the repository root to confirm every link, anchor, and checklist reference in this README is correct.

### 1. Verify the onboarding prompt file exists and contains the checklist anchor

```bash
# The file must exist
test -f spec/26-chrome-extension-generic/13-ai-onboarding-prompt.md && echo "PASS: file exists" || echo "FAIL: file missing"

# The checklist anchor must be present
grep -q "^## The 10-Step Build Checklist" spec/26-chrome-extension-generic/13-ai-onboarding-prompt.md && echo "PASS: checklist anchor found" || echo "FAIL: checklist anchor missing"

# The stop-conditions boundary must be present (marks checklist end)
grep -q "^## Stop conditions" spec/26-chrome-extension-generic/13-ai-onboarding-prompt.md && echo "PASS: stop-conditions boundary found" || echo "FAIL: stop-conditions boundary missing"
```

### 2. Verify every cross-referenced spec file exists

```bash
for f in \
  spec/26-chrome-extension-generic/00-overview.md \
  spec/26-chrome-extension-generic/01-fundamentals.md \
  spec/26-chrome-extension-generic/02-folder-and-build/01-repository-layout.md \
  spec/26-chrome-extension-generic/03-typescript-and-linter/01-typescript-rules.md \
  spec/26-chrome-extension-generic/03-typescript-and-linter/02-eslint-config.md \
  spec/26-chrome-extension-generic/03-typescript-and-linter/05-zero-warnings-policy.md \
  spec/26-chrome-extension-generic/04-architecture/02-three-world-model.md \
  spec/26-chrome-extension-generic/04-architecture/03-message-relay.md \
  spec/26-chrome-extension-generic/04-architecture/04-platform-adapter.md \
  spec/26-chrome-extension-generic/05-storage-layers/01-storage-tier-matrix.md \
  spec/26-chrome-extension-generic/06-ui-and-design-system/01-design-tokens.md \
  spec/26-chrome-extension-generic/06-ui-and-design-system/02-dark-only-theme.md \
  spec/26-chrome-extension-generic/07-error-management/01-error-model.md \
  spec/26-chrome-extension-generic/07-error-management/03-file-path-error-rule.md \
  spec/26-chrome-extension-generic/08-auth-and-tokens/03-no-retry-policy.md \
  spec/26-chrome-extension-generic/11-cicd-and-release/03-build-pipeline.md \
  spec/26-chrome-extension-generic/11-cicd-and-release/04-release-zip-contract.md \
  spec/26-chrome-extension-generic/12-templates/00-overview.md \
  spec/26-chrome-extension-generic/97-acceptance-criteria.md \
  spec/26-chrome-extension-generic/98-changelog.md \
  spec/26-chrome-extension-generic/99-consistency-report.md; do
  test -f "$f" && echo "PASS: $f" || echo "FAIL: $f MISSING"
done
```

### 3. Verify generification (zero project-specific identifiers)

```bash
# This must return ZERO hits (excluding this README's generification policy note)
rg -i 'riseup|marco|lovable|supabase' spec/26-chrome-extension-generic/ -g '!*/readme.md'
```

### 4. Verify all template files have token placeholders

```bash
# Every .template.* file must contain at least one of the five canonical tokens
for f in spec/26-chrome-extension-generic/12-templates/*.template.*; do
  if grep -qE '<(PROJECT_NAME|ROOT_NAMESPACE|VERSION|HOST_MATCHES|EXTENSION_ID)>' "$f"; then
    echo "PASS: $f has tokens"
  else
    echo "WARN: $f missing tokens (may be intentional)"
  fi
done
```

### Expected result

All `PASS` lines above should print. Any `FAIL` indicates a broken link, missing file, or stale reference in this README. Fix before using the blueprint.

---

## Generification policy

This folder MUST contain **zero** project-specific identifiers. Before
publishing any new content, run:

```bash
rg -i 'riseup|marco|lovable|supabase' spec/26-chrome-extension-generic/
```

The command MUST return zero hits (excluding this generification policy
note itself, which uses the names as forbidden examples).
