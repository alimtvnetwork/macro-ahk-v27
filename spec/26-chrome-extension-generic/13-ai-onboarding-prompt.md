# AI Onboarding Prompt

**Version:** 1.1.0
**Updated:** 2026-04-24
**Status:** Authored
**AI Confidence:** High
**Ambiguity:** None

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Purpose

This file is the **single entry point** for any AI agent (or human) tasked
with building a new Chrome MV3 extension from this blueprint. It contains:

1. **The one-prompt instruction** — copy verbatim into a fresh AI session.
2. **The five required input tokens** — what the human must supply.
3. **Operating rules** — how the agent must behave during the build.
4. **The 10-step build checklist** — the exact order of operations.

If the agent follows this file literally, the resulting extension will
satisfy `97-acceptance-criteria.md` without further intervention.

---

## The One-Prompt Instruction (copy verbatim)

> You are bootstrapping a new Chrome MV3 extension from the blueprint in
> `spec/26-chrome-extension-generic/`. Treat that folder as the **single
> source of truth**. Do not invent conventions, do not import patterns from
> other projects, do not deviate from the templates in `12-templates/`.
>
> Before writing any code, read every file in `spec/26-chrome-extension-generic/`
> in numeric order (`00-overview.md` → `01-fundamentals.md` →
> `02-folder-and-build/00-overview.md` → … → `13-ai-onboarding-prompt.md`
> → `97-acceptance-criteria.md`). Build a mental model of the six-phase
> lifecycle, three-world model, four-tier storage matrix, error model, and
> CODE-RED file/path rule. Do not skim.
>
> Then execute the **10-step build checklist** at the bottom of
> `13-ai-onboarding-prompt.md` in strict order. Do not parallelise steps,
> do not skip steps, do not reorder steps. After each step, run the
> verification command listed for that step and confirm it passes before
> proceeding.
>
> Substitute the five canonical tokens — `<PROJECT_NAME>`,
> `<ROOT_NAMESPACE>`, `<VERSION>`, `<HOST_MATCHES>`, `<EXTENSION_ID>` —
> using the values supplied below. If any of the five values is missing,
> stop and ask the human. Never invent a placeholder.
>
> Apply the following non-negotiable rules throughout: zero ESLint
> warnings (`03-typescript-and-linter/05-zero-warnings-policy.md`); the
> CODE-RED file/path rule (`07-error-management/03-file-path-error-rule.md`);
> dark-only theme (`06-ui-and-design-system/02-dark-only-theme.md`); no
> retry/backoff logic in injection or auth paths
> (`08-auth-and-tokens/03-no-retry-policy.md`); semantic HSL design tokens
> only — never hex or named colours in components.
>
> Stop and ask the human only when you encounter: (a) an explicit `<ASK>`
> marker in the spec, (b) a missing token value, or (c) a test or
> validator that fails *after* following the spec exactly. Otherwise
> proceed without questions.
>
> Required tokens (fill in before pasting this prompt):
> - `<PROJECT_NAME>` = ____
> - `<ROOT_NAMESPACE>` = ____   (PascalCase, dot-separated, e.g. `Acme.Tools`)
> - `<VERSION>` = ____           (semver, e.g. `0.1.0`)
> - `<HOST_MATCHES>` = ____      (JSON array of match patterns)
> - `<EXTENSION_ID>` = ____      (32-char Chrome ID, or `auto` for dev)
>
> When the 10 steps complete and `npm run build && npm run package`
> produces a clean ZIP that loads via `chrome://extensions → Load unpacked`,
> emit a final report listing: every step's verification result, the file
> count, the gzipped bundle size, the warning count (must be 0), and any
> deviations (must be empty). Then stop.

---

## Required input tokens (the human supplies these)

| Token | Format | Used in | Example |
|-------|--------|---------|---------|
| `<PROJECT_NAME>` | kebab-case slug | `package.json`, ZIP filename, repo folder | `acme-page-tools` |
| `<ROOT_NAMESPACE>` | PascalCase, dot-separated | `window.<ROOT_NAMESPACE>` global, log prefix, SDK IIFE name | `Acme.Tools` |
| `<VERSION>` | semver `MAJOR.MINOR.PATCH` | `manifest.json`, `package.json`, `constants.ts` | `0.1.0` |
| `<HOST_MATCHES>` | JSON array of MV3 match patterns | `manifest.json` `host_permissions` + `content_scripts.matches` | `["https://app.example.com/*"]` |
| `<EXTENSION_ID>` | 32-char `[a-p]` Chrome ID, or `auto` | Reserved key in `manifest.json` (production builds only) | `abcdefghijklmnopabcdefghijklmnop` |

If any value is missing, the agent MUST stop and ask. There are **no
defaults** — the blueprint is generic precisely because these five values
parameterise everything project-specific.

---

## Operating rules during the build

1. **Sequential, not parallel.** Execute the 10 steps in order. Do not start
   step N+1 until step N's verification command exits zero.
2. **Templates are law.** Files under `12-templates/` are copied verbatim,
   only token substitution and the documented per-target tweaks are allowed.
3. **No invented conventions.** If the spec is silent on a question, re-read
   the relevant `00-overview.md`. If still silent, treat as `<ASK>`.
4. **Zero warnings, always.** Never add `// eslint-disable` comments to
   silence warnings. Fix the underlying issue or stop and ask.
5. **CODE-RED enforcement.** Every FS / storage / DB error MUST use
   `AppError.fromFsFailure(...)` with non-null `path` and `missing`.
6. **No retry logic.** Injection and auth paths follow the no-retry policy.
   If a call fails, surface the error — do not loop.
7. **Dark theme only.** No light-mode toggle. No hex colours in components.
   All colours come from `index.css` HSL tokens.
8. **Verification is mandatory.** Each step lists a verification command;
   running it is part of the step, not optional.

---

## The 10-Step Build Checklist

Execute in order. Do not skip, parallelise, or reorder.

### Step 1 — Scaffold the repository layout

**Source of truth:** `02-folder-and-build/01-repository-layout.md`

Create the project root, all sub-folders (`src/`, `src/background/`,
`src/content/`, `src/options/`, `src/popup/`, `src/sdk/`, `src/messaging/`,
`src/storage/`, `src/auth/`, `src/types/`, `src/config/`, `tests/`,
`scripts/`, `public/`), and empty `.gitkeep` files where the spec requires.

**Verification:** `tree -L 3 -I node_modules` matches the layout diagram in
`02-folder-and-build/01-repository-layout.md`.

### Step 2 — Copy and tokenise the templates

**Source of truth:** `12-templates/00-overview.md` and every `*.template.*`
file in that folder.

Copy each template to its destination path, performing exactly five global
substitutions: `<PROJECT_NAME>`, `<ROOT_NAMESPACE>`, `<VERSION>`,
`<HOST_MATCHES>`, `<EXTENSION_ID>`. Strip the `.template` infix from
filenames. Preserve all other content byte-for-byte.

**Verification:** `rg "<(PROJECT_NAME|ROOT_NAMESPACE|VERSION|HOST_MATCHES|EXTENSION_ID)>" -l`
returns no matches anywhere in the project (templates are fully resolved).

### Step 3 — Install dependencies

**Source of truth:** `02-folder-and-build/05-package-json-scripts.md` and
`12-templates/package.json.template`.

Run `npm install` (or `bun install` if the spec specifies bun). Do not add,
remove, or upgrade any dependency outside the spec's pinned versions. Do not
generate a fresh lockfile — the template's lockfile is authoritative if
present; otherwise the install creates one.

**Verification:** `npm ls --depth=0` shows every dependency from
`package.json` resolved with no `UNMET` or `extraneous` warnings.

### Step 4 — Wire TypeScript and ESLint with zero warnings

**Source of truth:** `03-typescript-and-linter/01-typescript-rules.md`,
`03-typescript-and-linter/02-eslint-config.md`,
`03-typescript-and-linter/05-zero-warnings-policy.md`.

Confirm `tsconfig.app.json`, `tsconfig.sdk.json`, `tsconfig.node.json`,
`eslint.config.js`, and `.prettierrc` are in place from Step 2. The
`no-bare-fs-error` blueprint rule must be enabled at severity `error`.

**Verification:** `npm run lint` exits zero with `0 warnings, 0 errors` and
`npm run typecheck` exits zero on all three tsconfigs.

### Step 5 — Implement `AppError` and the namespace logger

**Source of truth:** `07-error-management/01-error-model.md`,
`07-error-management/02-error-code-registry.md`,
`07-error-management/03-file-path-error-rule.md`,
`07-error-management/04-namespace-logger.md`.

Place `AppError` at `src/types/error-model.ts` (verbatim from the template).
Place the logger at `src/diagnostics/namespace-logger.ts` and attach it to
`window.<ROOT_NAMESPACE>.Logger` in every entry point. Seed the error code
registry table from `02-error-code-registry.md` into
`tests/error-codes.spec.ts` as a guard test.

**Verification:** `npm test -- error-codes` passes; `rg "throw new Error\("
src/` returns zero matches (only `AppError` may be thrown).

### Step 6 — Implement the platform adapter and Chrome adapter

**Source of truth:** `04-architecture/04-platform-adapter.md` and
`12-templates/{platform-adapter,chrome-adapter}.template.ts`.

Place the typed `PlatformAdapter` interface at
`src/platform/platform-adapter.ts` and the Chrome implementation at
`src/platform/chrome-adapter.ts`. Every `chrome.*` API used in the project
MUST be reached through this adapter — no direct `chrome.runtime.*` /
`chrome.storage.*` / `chrome.tabs.*` calls outside `src/platform/`.

**Verification:** `rg "\\bchrome\\." src/ -g '!src/platform/**'` returns
zero matches.

### Step 7 — Implement the three-world message relay

**Source of truth:** `04-architecture/02-three-world-model.md`,
`04-architecture/03-message-relay.md`, and
`12-templates/message-client.template.ts`.

Place the relay client at `src/messaging/client.ts`, the router at
`src/messaging/router.ts`, and the page-bridge for the MAIN world at
`src/sdk/page-bridge.ts`. Define every message type via the
`defineMessage(...)` factory — no inline string types. Background relays
between content scripts and the page bridge per the 3-tier diagram.

**Verification:** `npm test -- messaging` passes; a manual postMessage
round-trip from MAIN → ISOLATED → background → ISOLATED → MAIN completes in
under 100 ms in the dev build.

### Step 8 — Implement the chosen storage tier(s)

**Source of truth:** `05-storage-layers/00-overview.md` and the per-tier
files (`02-sqlite-in-background.md`, `03-sqlite-schema-conventions.md`,
`04-indexeddb-page-cache.md`, `05-chrome-storage-local.md`,
`06-localstorage-bridges.md`, `07-self-healing-and-migrations.md`).

Use the tier matrix in `01-storage-tier-matrix.md` to pick the minimum
tiers required. SQLite-in-background is the default for any data that must
survive cleanup; IndexedDB for page-side caches; `chrome.storage.local` for
small typed config; localStorage TTL bridges only for ≤ 10-min credential
hand-offs to the MAIN world.

**Verification:** `npm test -- storage` passes; `npm run check:codered` (the
`scripts/check-error-rule.mjs` validator) exits zero.

### Step 9 — Build the UI shells (Options, Popup, optional injected controller)

**Source of truth:** `06-ui-and-design-system/05-options-page-shell.md`,
`06-ui-and-design-system/06-popup-shell.md`,
`06-ui-and-design-system/07-injected-controller-ui.md`,
`06-ui-and-design-system/01-design-tokens.md`,
`06-ui-and-design-system/02-dark-only-theme.md`.

Place `index.css` (HSL tokens) and `tailwind.config.ts` from Step 2. Build
the Options page at `src/options/`, the Popup at `src/popup/`, and (if the
project ships an injected controller) the controller UI at `src/sdk/ui/`.
All colours come from semantic tokens — no hex literals in components.

**Verification:** `rg "#[0-9a-fA-F]{3,8}\\b" src/ -g '!**/*.css' -g
'!**/*.md'` returns zero matches; the Options page renders with the dark
theme on first load (no FOUC, no light-mode flash).

### Step 10 — Build, package, and verify install

**Source of truth:** `11-cicd-and-release/03-build-pipeline.md`,
`11-cicd-and-release/04-release-zip-contract.md`,
`02-folder-and-build/06-packaging-and-zip.md`.

Run, in order:

```bash
npm run validate     # all check-*.mjs scripts
npm run lint         # zero warnings policy
npm run typecheck    # all tsconfigs
npm test             # vitest unit suite
npm run build        # vite production build
npm run package      # zip with the release contract
```

Then in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click **Load unpacked** and select `dist/`.
4. Confirm: no errors badge, the icon appears in the toolbar, opening the
   popup shows the dark-themed shell, opening the options page renders the
   navigation, and the background service worker is `active` in the
   extension's detail page.

**Verification:** `npm run validate:zip` (which inspects the produced ZIP
against the release contract) exits zero, and the in-Chrome checklist above
passes.

---

## Stop conditions (the only times the agent may ask)

- An explicit `<ASK>` marker appears in any spec file consulted.
- One of the five required tokens was not supplied in the prompt.
- A verification command fails *after* the corresponding step was followed
  exactly per the spec — in that case, attach the failing command, the
  exit code, the last 50 lines of output, and ask for guidance.
- The spec is genuinely silent on a question (re-read the parent
  `00-overview.md` first; only escalate if still silent).

For all other situations: proceed without asking.

---

## Final report (emitted after Step 10)

When all 10 steps pass, the agent emits a structured report:

```
Build complete: <PROJECT_NAME> v<VERSION>
- Steps passed: 10/10
- ESLint warnings: 0
- ESLint errors: 0
- TypeScript errors: 0
- Tests passed: <count>/<count>
- Files generated: <count>
- dist/ size (gzipped): <size>
- ZIP filename: <PROJECT_NAME>-<VERSION>.zip
- ZIP contract validation: PASS
- Chrome load-unpacked: PASS
- Deviations from spec: none
```

If any line above would not be `PASS` / `0` / `none`, the agent stops
before producing the report and surfaces the failure under the
appropriate stop condition above.

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Folder index | `./00-overview.md` |
| Fundamentals | `./01-fundamentals.md` |
| Templates index | `./12-templates/00-overview.md` |
| Repository layout | `./02-folder-and-build/01-repository-layout.md` |
| TypeScript rules | `./03-typescript-and-linter/01-typescript-rules.md` |
| ESLint config | `./03-typescript-and-linter/02-eslint-config.md` |
| Zero-warnings policy | `./03-typescript-and-linter/05-zero-warnings-policy.md` |
| Three-world model | `./04-architecture/02-three-world-model.md` |
| Message relay | `./04-architecture/03-message-relay.md` |
| Platform adapter | `./04-architecture/04-platform-adapter.md` |
| Storage tier matrix | `./05-storage-layers/01-storage-tier-matrix.md` |
| Design tokens | `./06-ui-and-design-system/01-design-tokens.md` |
| Dark-only theme | `./06-ui-and-design-system/02-dark-only-theme.md` |
| AppError model | `./07-error-management/01-error-model.md` |
| CODE-RED rule | `./07-error-management/03-file-path-error-rule.md` |
| No-retry policy | `./08-auth-and-tokens/03-no-retry-policy.md` |
| Build pipeline | `./11-cicd-and-release/03-build-pipeline.md` |
| ZIP contract | `./11-cicd-and-release/04-release-zip-contract.md` |
| Acceptance criteria | `./97-acceptance-criteria.md` |
