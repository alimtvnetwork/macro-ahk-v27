# Plan — `spec/26-chrome-extension-generic/`

**Status:** Draft (planning only — no spec files written yet)
**Author:** Lovable AI
**Date:** 2026-04-24 (Asia/Kuala_Lumpur)
**Goal:** Produce a *drop-in* spec folder distilled from everything we learned building the Riseup Asia Macro Extension, written generically so any AI can read it and **blindly build a new Chrome MV3 extension end-to-end** — UI, TypeScript, SQLite + IndexedDB + chrome.storage layering, namespace concept, error model, design tokens, linter setup, folder structure, CI, and packaging.

The spec must be **AI-followable, not human tutorial**. Every section ends with explicit *DO / DO NOT / VERIFY* checklists.

---

## 1. Why this spec exists

Today, our Chrome-extension knowledge is spread across:

- `spec/21-app/` (app-specific — too coupled)
- `spec/22-app-issues/` (post-mortems — context-heavy)
- `mem://architecture/*` (project-private memories)
- `standalone-scripts/marco-sdk/` (concrete code — not portable)

A new project cannot reuse this without weeks of archaeology. The new
folder **`spec/26-chrome-extension-generic/`** will:

1. Live in the **core fundamentals range (01–20 reserved → 26 is app-adjacent foundational)**. Because it is foundational *and* app-shaped, we place it at **26** — first free slot after 22, kept separate from `21-app` so it is not confused with the current app. This matches the "next available number" rule in `spec/01-spec-authoring-guide/01-folder-structure.md`.
2. Contain **only generic, reusable patterns** — never reference Riseup, Marco, Lovable IDE, or this codebase by name.
3. Ship templates a junior AI can copy-paste (manifest, tsconfig, vite, eslint, folder skeleton).
4. Be **self-contained** — no required cross-references outside `spec/01-…` (authoring) and `spec/02-coding-guidelines/02-typescript/` (TS rules).

---

## 2. Folder layout (proposed)

```
spec/26-chrome-extension-generic/
├── 00-overview.md                          # Index, scoring, AI confidence, file table
├── 01-fundamentals.md                      # MV3 invariants, lifecycle, boundaries
├── 02-folder-and-build/
│   ├── 00-overview.md
│   ├── 01-repository-layout.md             # Top-level tree (src/, standalone-scripts/, scripts/, spec/)
│   ├── 02-tsconfig-matrix.md               # tsconfig.app / tsconfig.sdk / tsconfig.node split
│   ├── 03-vite-config.md                   # Per-bundle vite configs (extension / sdk / standalone)
│   ├── 04-manifest-mv3.md                  # manifest.json template + permission policy
│   ├── 05-package-json-scripts.md          # build / build:sdk / dev / test / lint / package
│   └── 06-packaging-and-zip.md             # nix-zip recipe, dist/ contract, version.txt
├── 03-typescript-and-linter/
│   ├── 00-overview.md
│   ├── 01-typescript-rules.md              # strict mode, no-any, no-unknown policy, generics
│   ├── 02-eslint-config.md                 # flat-config template, sonarjs, react-hooks, import
│   ├── 03-prettier-and-formatting.md
│   ├── 04-naming-conventions.md            # PascalCase / camelCase / SCREAMING_SNAKE_CASE
│   └── 05-zero-warnings-policy.md          # Linter must stay at 0/0 across src + standalone
├── 04-architecture/
│   ├── 00-overview.md
│   ├── 01-six-phase-lifecycle.md           # Install → bootstrap → SW → injection → auth → teardown
│   ├── 02-three-world-model.md             # Background SW / content (ISOLATED) / page (MAIN)
│   ├── 03-message-relay.md                 # 3-tier relay: page ↔ content ↔ background
│   ├── 04-platform-adapter.md              # chrome-adapter + platform-adapter interfaces
│   ├── 05-namespace-system.md              # window.<RootNamespace>.Projects.<ProjectName>.*
│   ├── 06-namespace-registration.md        # Register / freeze / self-test pattern
│   └── 07-injection-pipeline.md            # 7-stage: resolve→bootstrap→require→mount→auth→ready→marker
├── 05-storage-layers/
│   ├── 00-overview.md
│   ├── 01-storage-tier-matrix.md           # 4 tiers w/ size, persistence, scope, latency
│   ├── 02-sqlite-in-background.md          # sql.js / sqlite-wasm, bundle vs runtime, OPFS fallback
│   ├── 03-sqlite-schema-conventions.md     # PascalCase tables, JsonSchemaDef, migrations
│   ├── 04-indexeddb-page-cache.md          # When to use IDB vs SQLite; dual-cache pattern
│   ├── 05-chrome-storage-local.md          # chrome.storage.local for manifests + bootstrap
│   ├── 06-localstorage-bridges.md          # TTL bridges for MAIN-world tokens (with risks)
│   └── 07-self-healing-and-migrations.md   # builtin-script-guard pattern, hash-based reseed
├── 06-ui-and-design-system/
│   ├── 00-overview.md
│   ├── 01-design-tokens.md                 # HSL semantic tokens in index.css + tailwind.config
│   ├── 02-dark-only-theme.md               # Justification + palette + contrast targets
│   ├── 03-typography-spacing.md
│   ├── 04-component-library.md             # shadcn-style primitives, variants via cva
│   ├── 05-options-page-shell.md            # Sidebar + content + view-transitions
│   ├── 06-popup-shell.md                   # Popup sizing, debug panel, action log
│   ├── 07-injected-controller-ui.md        # Floating draggable widget pattern, sentinel CSS
│   ├── 08-notification-system.md           # SDK-side toast (dedupe window, max-3, copy-diag)
│   └── 09-customization-hooks.md           # Per-project CSS bindings, theme overrides
├── 07-error-management/
│   ├── 00-overview.md
│   ├── 01-error-model.md                   # AppError shape (code, path, missing, reason, stack)
│   ├── 02-error-code-registry.md           # SCREAMING_SNAKE prefixes, allocation rules
│   ├── 03-file-path-error-rule.md          # CODE-RED: every FS error must include path/missing/why
│   ├── 04-namespace-logger.md              # RiseupAsiaMacroExt.Logger pattern (renamed generic)
│   ├── 05-error-broadcast.md               # ERROR_COUNT_CHANGED, real-time UI sync
│   ├── 06-stack-trace-filtering.md         # Drop chunk-*.js / assets/*.js noise
│   └── 07-diagnostic-export.md             # ZIP bundle (logs.txt, sessions, manifest snapshot)
├── 08-auth-and-tokens/
│   ├── 00-overview.md
│   ├── 01-bearer-token-bridge.md           # Single getBearerToken() path, no fallbacks
│   ├── 02-readiness-gate.md                # Unified 10s budget pattern
│   ├── 03-no-retry-policy.md               # Sequential fail-fast, no exponential backoff
│   └── 04-host-permission-failures.md      # "Cannot access contents of the page" recovery
├── 09-injection-and-host-access/
│   ├── 00-overview.md
│   ├── 01-host-permissions.md              # manifest matches[] vs optional_host_permissions
│   ├── 02-restricted-schemes.md            # chrome:// / chrome-extension:// / Web Store rules
│   ├── 03-tab-eligibility.md               # url-matcher, project-matcher patterns
│   ├── 04-cooldown-and-blocked-tabs.md     # Diagnostics surface + indicator UI
│   └── 05-token-seeder.md                  # executeScript MAIN-world seeding pattern
├── 10-testing-and-qa/
│   ├── 00-overview.md
│   ├── 01-vitest-unit.md
│   ├── 02-playwright-e2e.md                # Persistent context, MV3 service-worker boot
│   ├── 03-snapshot-testing.md              # Options + popup snapshots
│   └── 04-non-regression-rules.md
├── 11-cicd-and-release/
│   ├── 00-overview.md
│   ├── 01-validation-scripts.md            # check-version-sync, check-manifest-permissions, etc.
│   ├── 02-version-policy.md                # Single version across manifest + constants + SDK
│   ├── 03-build-pipeline.md
│   ├── 04-release-zip-contract.md
│   └── 05-quality-badges.md
├── 12-templates/                           # COPY-PASTE READY artifacts
│   ├── 00-overview.md
│   ├── manifest.template.json
│   ├── tsconfig.app.template.json
│   ├── tsconfig.sdk.template.json
│   ├── tsconfig.node.template.json
│   ├── vite.config.template.ts
│   ├── vite.config.sdk.template.ts
│   ├── eslint.config.template.js
│   ├── tailwind.config.template.ts
│   ├── index.css.template
│   ├── error-model.template.ts
│   ├── platform-adapter.template.ts
│   ├── chrome-adapter.template.ts
│   ├── namespace-logger.template.ts
│   ├── message-client.template.ts
│   └── package.json.template
├── 13-ai-onboarding-prompt.md              # The single prompt to feed an AI ("read this folder and build")
├── 97-acceptance-criteria.md
├── 98-changelog.md
└── 99-consistency-report.md
```

**Total:** 12 sub-folders + 4 governance files + 13 templates.

---

## 3. Per-section content brief

### 3.1 `00-overview.md`

- Header block (Version 1.0.0, Status Active, AI Confidence Production-Ready, Ambiguity None).
- 2-paragraph "what is this" — generic Chrome MV3 extension blueprint.
- **Goal statement:** "An AI that reads only this folder must be able to scaffold, build, lint, package, and ship a production-quality MV3 extension without referring to any other project."
- File inventory table (all 13 sub-areas).
- Cross-refs only to `spec/01-spec-authoring-guide/` and `spec/02-coding-guidelines/02-typescript/`.

### 3.2 `01-fundamentals.md`

Distilled from `spec/21-app/01-fundamentals.md` but fully genericised. Covers:

- MV3 invariants (no remote code, service-worker model, no `eval`, CSP).
- 4 layer boundaries (background SW / content / page MAIN / options & popup).
- 6-phase lifecycle (table form).
- 4 storage tiers (table form).
- 6 hard invariants (dark-only theme **optional but recommended**, single auth path, sequential fail-fast, file-path error rule, unified version, no Supabase / no remote keys baked in).
- DO / DO NOT / VERIFY block.

### 3.3 `02-folder-and-build/` (6 files)

**Sources:** `tsconfig.*.json`, `vite.config.*.ts`, `package.json`, `manifest.json`, `scripts/check-built-manifest-csp.mjs`, `scripts/check-manifest-permissions.mjs`.

Each file ends with a literal **template snippet** (full JSON / TS) the AI can copy verbatim. Permission policy table maps each common need (storage, scripting, tabs, host access, declarativeNetRequest, offscreen, sidePanel) to (a) when to request, (b) Web-Store risk level, (c) alternative.

### 3.4 `03-typescript-and-linter/` (5 files)

**Sources:** `eslint.config.js`, `tsconfig.json`, `mem://standards/unknown-usage-policy`, `mem://architecture/linting-policy`, `mem://standards/formatting-and-logic`.

- Strict TS settings table (every `compilerOptions` flag justified).
- ESLint flat-config template — sonarjs + react-hooks + import + no-any + custom `lint-const-reassign.mjs`-style guard.
- Naming conventions (mem://architecture/constant-naming-convention condensed).
- Zero-warnings policy + CI enforcement.

### 3.5 `04-architecture/` (7 files)

**Sources:** `mem://architecture/{message-relay-system, platform-adapter-pattern, injection-context-awareness, script-injection-lifecycle, extension-lifecycle, dynamic-script-loading}`, `src/platform/`, `src/background/message-registry.ts`, `standalone-scripts/marco-sdk/src/{index,bridge,self-namespace,self-test}.ts`.

Each file has:

- Concept diagram (ASCII or Mermaid).
- Interface signatures (TS).
- Reference implementation snippet (≤ 30 lines).
- Common pitfalls table.

The **namespace system** spec (05) is the keystone — it documents:
- `window.<Root>.Projects.<ProjectName>.*` shape.
- `Object.freeze` policy.
- `register{Name}SelfNamespace()` factory pattern.
- Runtime self-test that logs PASS / FAIL on every page load.

### 3.6 `05-storage-layers/` (7 files)

**Sources:** `mem://architecture/data-storage-layers`, `mem://architecture/self-healing-script-storage`, `mem://architecture/instruction-driven-seeding`, `spec/04-database-conventions/`, `spec/05-split-db-architecture/`, `spec/06-seedable-config-architecture/`.

The crown jewel here is the **storage tier matrix** (table 5.1 in `01-storage-tier-matrix.md`):

| Tier | Tech | Scope | Capacity | Persists across | Use for | Avoid for |
|------|------|-------|----------|-----------------|---------|-----------|
| 1 | SQLite (sqlite-wasm + OPFS) | Background SW | Unlimited | Extension reinstall? **No**. Cleanup? **Yes**. | Sessions, errors, namespaces, project DBs | Page-side hot caches |
| 2 | IndexedDB | Page (per origin) | ~50% disk | Browser data clear | Per-project hot caches (dual JsonCopy / HtmlCopy) | Cross-origin shared data |
| 3 | chrome.storage.local | Extension | ~10 MB (unlimitedStorage opt-in) | Extension reinstall? **No**. | Manifest, builtin scripts, bootstrap config | Anything secret |
| 4 | localStorage | Page (per origin) | ~5 MB | Browser data clear | TTL bridges (e.g., MAIN-world tokens) | Anything > 100 KB or anything sensitive long-term |

Plus dedicated files for SQLite-in-SW (sql.js bundling, WASM checksum, OPFS opt-in), schema conventions (PascalCase tables, JsonSchemaDef format, additive migrations), the IDB dual-cache pattern, and the **self-healing builtin-script-guard** two-stage check.

### 3.7 `06-ui-and-design-system/` (9 files)

**Sources:** `spec/07-design-system/`, `mem://preferences/dark-only-theme`, `mem://style/animation-strategy`, `mem://ui/view-transition-patterns`, `mem://features/css-injection-sentinel`, `tailwind.config.ts`, `src/index.css`, `src/components/ui/`.

- HSL token system (semantic only — never raw colors in JSX).
- Recommended palette presets (4 dark, 2 light) with hex+HSL.
- Tailwind + cva variant pattern with example.
- Options shell: sidebar + animated content area + ThemeProvider (locked to dark by default).
- Popup shell: 360×600 baseline, action log, debug panel.
- **Injected controller UI:** the floating-widget pattern (z-index, shadow-root vs. data-attrs, CSS sentinel, drag handle, dropdown menu).
- Notification system: `marco.notify`-equivalent (renamed `ext.notify`) — info/warn/error/success, 5s dedupe window, max 3 visible, copy-to-clipboard diagnostic on errors, version banner during init.
- Customization hooks: per-project CSS injection slot, theme overrides via CSS variables.

### 3.8 `07-error-management/` (7 files)

**Sources:** `spec/03-error-manage/`, `mem://constraints/file-path-error-logging-code-red`, `mem://standards/error-logging-requirements`, `mem://architecture/extension-error-management`, `mem://architecture/real-time-error-synchronization`, `mem://preferences/stack-trace-filtering`, `mem://features/log-diagnostics-export`, `src/types/error-model.ts`.

- The `AppError` shape (code, severity, path?, missing?, reason, timestamp, stack).
- Error code registry — SCREAMING_SNAKE with module prefix (`TOKEN-SEEDER_ERROR`, `STORAGE_QUOTA_EXCEEDED`, ...).
- **CODE-RED file/path rule:** every FS or chrome.storage error MUST include exact path, what was missing, and why — non-negotiable, with examples.
- NamespaceLogger contract (info/warn/error + per-namespace prefix).
- ERROR_COUNT_CHANGED broadcast pattern + UI badge sync.
- Stack-trace filter regex (drops `chunk-*.js` / `assets/*.js`).
- Diagnostic ZIP export contents.

### 3.9 `08-auth-and-tokens/` (4 files)

Generic version of the bearer-token bridge — uses placeholder header name `Authorization`, abstracts away Lovable specifics. Documents the **single-path policy** (no fallbacks), **10s readiness gate**, **no recursive retry / exponential backoff**, and the host-permission failure recovery the user just hit ("Cannot access contents of the page").

### 3.10 `09-injection-and-host-access/` (5 files)

Direct synthesis of the recent token-seeder work + diagnostics indicator. Will give the next AI a turnkey recipe so the same bug never recurs. Includes:

- Permission decision tree (matches[] vs optional_host_permissions vs activeTab).
- Restricted scheme list (chrome://, chrome-extension://, edge://, view-source:, file:// without flag, Web Store).
- Tab eligibility evaluator interface.
- Cooldown + blocked-tab diagnostics data shape (mirrors `TokenSeederStatusIndicator` payload).
- `chrome.scripting.executeScript` MAIN-world seeder template with retry-cooldown-on-failure (NOT exponential backoff — fixed cooldown).

### 3.11 `10-testing-and-qa/` (4 files)

- Vitest setup (jsdom, MSW for fetch, fake-indexeddb, fake chrome API).
- Playwright MV3 e2e (persistent context boot, service-worker handle, options/popup pages, screenshot diff).
- Snapshot testing pattern.
- Non-regression rules registry (every fixed bug → 1 test, formatted as a table).

### 3.12 `11-cicd-and-release/` (5 files)

Translation of our current `scripts/check-*.mjs` validation gauntlet into a generic checklist:

- version-sync, manifest-permissions, manifest-csp, no-hardcoded-extension-paths, installer-contract, dist-freshness, schema-contract, sdk/xpath dist freshness.
- Single-version policy across `manifest.json` + `constants.ts` + each standalone SDK.
- ZIP release contract (folder layout inside the zip, required files, max size).
- Quality-badges workflow (already in `.github/workflows/quality-badges.yml`).

### 3.13 `12-templates/` (15 files)

Literal copy-paste artifacts. Each begins with a header comment:

```
// TEMPLATE — spec/26-chrome-extension-generic/12-templates/<name>
// Replace <PROJECT_NAME>, <ROOT_NAMESPACE>, <VERSION> tokens.
// Last reviewed: <YYYY-MM-DD>
```

Tokens used across templates: `<PROJECT_NAME>`, `<ROOT_NAMESPACE>`, `<VERSION>`, `<HOST_MATCHES>`, `<EXTENSION_ID>`.

### 3.14 `13-ai-onboarding-prompt.md`

The **single prompt** to paste into a fresh AI session:

> "You are bootstrapping a new Chrome MV3 extension. Read every file in `spec/26-chrome-extension-generic/` in numeric order, then execute the 10-step build checklist at the bottom of `13-ai-onboarding-prompt.md` without asking questions unless an explicit `<ASK>` marker is encountered."

Followed by the 10-step checklist:

1. Create folder skeleton from `02-folder-and-build/01-repository-layout.md`.
2. Copy templates from `12-templates/`, substituting tokens.
3. Run `npm install` with the exact dep list in `02-folder-and-build/05-package-json-scripts.md`.
4. Wire `eslint.config.js` and verify zero warnings.
5. Implement NamespaceLogger + AppError per `07-error-management/`.
6. Implement platform-adapter + chrome-adapter per `04-architecture/04-…`.
7. Implement message relay per `04-architecture/03-…`.
8. Implement storage tier of choice per `05-storage-layers/`.
9. Implement Options shell + Popup shell + (optional) injected controller per `06-ui-and-design-system/`.
10. Run `npm run build && npm run package`. Verify the produced ZIP loads cleanly via `chrome://extensions → Load unpacked`.

### 3.15 Governance files

- `97-acceptance-criteria.md` — ~40 numbered, testable AC items grouped by section (AC-FUND-01..06, AC-BUILD-01..08, AC-TS-01..05, AC-ARCH-01..07, AC-STORAGE-01..07, AC-UI-01..09, AC-ERR-01..07, AC-AUTH-01..04, AC-INJ-01..05, AC-TEST-01..04, AC-CICD-01..05).
- `98-changelog.md` — initial entry: 1.0.0 / 2026-04-25 / Initial generic Chrome extension blueprint extracted from Riseup Asia Macro Extension v2.194.0.
- `99-consistency-report.md` — populated by the standard template in `spec/01-spec-authoring-guide/03-required-files.md`.

---

## 4. Generification rules (HARD)

While extracting from this codebase, the writer AI MUST:

1. **Rename** every project-specific identifier:
   - `Riseup`, `RiseupAsia`, `RiseupAsiaMacroExt` → `<RootNamespace>` placeholder, with example `MyExt`.
   - `marco`, `Marco`, `MacroLoop`, `Macro Controller` → `controller`, `<ProjectName>`.
   - `Lovable IDE`, `lovable.app`, `lovable.dev` → `<TargetSite>` placeholder.
   - `getBearerToken()` (Lovable-coupled) → keep the *name* (it is a generic verb) but strip Lovable specifics.
2. **Strip** every URL, secret, hostname, customer name, internal team reference.
3. **Strip** Supabase, axios-version-pin specifics, and any vendor lock-in beyond what MV3 itself requires.
4. **Add** a top-of-file banner: `*Generic blueprint — no project-specific identifiers. If you find one, file an issue.*`
5. **Verify** by `rg -i 'riseup|marco|lovable|supabase' spec/26-chrome-extension-generic/` returning **zero hits** before publishing v1.0.0.

---

## 5. Cross-references the spec WILL use

- `spec/01-spec-authoring-guide/01-folder-structure.md` — folder rules.
- `spec/01-spec-authoring-guide/03-required-files.md` — required files & templates.
- `spec/02-coding-guidelines/02-typescript/00-overview.md` — TS standards.
- `spec/03-error-manage/00-overview.md` — error management foundations.
- `spec/04-database-conventions/00-overview.md` — DB conventions (only the generic parts).
- `spec/07-design-system/00-overview.md` — design system foundations.

The spec MUST NOT reference `spec/21-app/`, `spec/22-app-issues/`, or any `mem://` path (those are project-private).

---

## 6. Build order & estimated effort

| # | Step | Files | Effort |
|---|------|-------|--------|
| 1 | Create folder skeleton + `00-overview.md` + `99-consistency-report.md` + `98-changelog.md` | 3 | 15 min |
| 2 | `01-fundamentals.md` | 1 | 30 min |
| 3 | `02-folder-and-build/` (6 files + templates referenced in §12) | 6 | 90 min |
| 4 | `03-typescript-and-linter/` (5 files) | 5 | 60 min |
| 5 | `04-architecture/` (7 files) | 7 | 120 min |
| 6 | `05-storage-layers/` (7 files) | 7 | 120 min |
| 7 | `06-ui-and-design-system/` (9 files) | 9 | 120 min |
| 8 | `07-error-management/` (7 files) | 7 | 90 min |
| 9 | `08-auth-and-tokens/` (4 files) | 4 | 45 min |
| 10 | `09-injection-and-host-access/` (5 files) | 5 | 60 min |
| 11 | `10-testing-and-qa/` (4 files) | 4 | 45 min |
| 12 | `11-cicd-and-release/` (5 files) | 5 | 60 min |
| 13 | `12-templates/` (15 copy-paste artifacts) | 15 | 90 min |
| 14 | `13-ai-onboarding-prompt.md` | 1 | 30 min |
| 15 | `97-acceptance-criteria.md` (≈ 65 ACs) | 1 | 45 min |
| 16 | Generification grep + final consistency pass | — | 30 min |
| **Total** | | **80 files** | **~17 hours of writer AI time** |

Recommended split into **4 chat sessions** (≈ 4 hours each) to stay within context budgets:

- **Session A:** §1, §2, §3, §4 (foundation + folder/build + TS/linter).
- **Session B:** §5, §6 (architecture + storage).
- **Session C:** §7, §8, §9, §10 (UI + errors + auth + injection).
- **Session D:** §11, §12, §13, §14, §15, §16 (testing + CI + templates + onboarding + ACs + final pass).

---

## 7. Open questions (please confirm before I start writing)

1. **Folder number 26 OK?** Or do you prefer slotting it into the foundational range (e.g., reusing `15` or `16`, both currently empty)? Per the authoring guide, 15–20 are reserved for *core fundamentals* — a generic Chrome-extension blueprint qualifies. My recommendation: **place it at `15-chrome-extension-generic/`** instead of 26, to live with the other foundational specs. The folder list in this plan still says 26 — say the word and I'll renumber.
2. **Light-mode optional?** Default we ship is dark-only (per `mem://preferences/dark-only-theme`), but for a generic blueprint should I include a "light + dark + system" path too? My recommendation: **document dark-only as default, with one optional appendix for light-mode opt-in**.
3. **Include the SDK / standalone-scripts pattern?** That is one of our most powerful patterns (re-usable per-project namespaces with `require()` + self-test). It adds ~3 files to `04-architecture/`. My recommendation: **yes, include — it is generic, valuable, and fully decoupled**.
4. **Templates — full files or skeletons?** Full files (e.g., a complete `eslint.config.js`) are more useful but date faster. My recommendation: **full files, with a "Last reviewed" date in the header banner**.

---

## 8. Acceptance for this plan

This plan is approved when you confirm answers to the four open questions in §7. After approval I will execute Sessions A–D in order, opening one task per session and closing this plan with a pointer to `spec/<NN>-chrome-extension-generic/00-overview.md`.
