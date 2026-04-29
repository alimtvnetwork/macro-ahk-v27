# Memory: project/documentation-hierarchy
Updated: 2026-04-22 (post v3.2.0 reorganization)

Project documentation lives in the `spec/` directory using the canonical Spec Authoring Guide v3.2.0 layout. The tree is divided into **core (01–17)** universal standards, **app (21+)** product-specific content, **archive (99)** for retired material, and **governance** files at the root and under `validation-reports/`.

---

## Core fundamentals (01–17)

Universal standards that apply to any project consuming this spec tree.

| Folder | Content | Status |
|--------|---------|--------|
| `01-spec-authoring-guide/` | Spec authoring templates, conventions, structural standards (v3.2.0 authority) | Active |
| `02-coding-guidelines/` | Unified coding standards (TS, Go, PHP, Rust, C#, AI optimization). Engineering Standards (26 rules) | Active |
| `03-error-manage/` | Error management specifications, error handling patterns, response envelopes | Active |
| `04-database-conventions/` | Database conventions, schema patterns | Active |
| `05-split-db-architecture/` | Split database architecture, SQLite organization patterns | Active |
| `06-seedable-config-architecture/` | Seedable config, changelog versioning, RAG validation | Active |
| `07-design-system/` | Design system tokens, UI component standards (renamed from 09-design-system/) | Active |
| `08-docs-viewer-ui/` | Docs viewer UI specifications | 🟡 Stub |
| `09-code-block-system/` | Code block rendering and styling system | 🟡 Stub |
| `10-research/` | Research notes, evaluations, comparisons | 🟡 Stub |
| `11-powershell-integration/` | PowerShell installer + integration specs | Active |
| `12-cicd-pipeline-workflows/` | CI/CD pipeline & workflow specs | 🟡 Stub |
| `14-update/` | Update mechanism specifications | 🟡 Stub |
| `17-consolidated-guidelines/` | Aggregated cross-cutting guidelines | 🟡 Stub |

Reserved gaps: **13, 15, 16, 18, 19, 20** — vacant by design for future core topics. App content must NOT fill these.

---

## App-specific (21+)

Chrome-extension product content lives entirely under `21-app/`.

| Folder | Content |
|--------|---------|
| `21-app/00-overview.md` | App-tree master index |
| `21-app/01-fundamentals.md` | App-level fundamentals |
| `21-app/02-features/` | Feature specs container |
| `21-app/02-features/chrome-extension/` | Extension architecture, build, message protocol, testing (was `11-chrome-extension/`) |
| `21-app/02-features/macro-controller/` | Macro controller specs: credits, workspaces, UI, TS migrations (was `10-macro-controller/`) |
| `21-app/02-features/devtools-and-injection/` | DevTools injection, SDK conventions, per-project architecture (was `12-devtools-and-injection/`) |
| `21-app/02-features/misc-features/` | Cross-cutting feature specs (was `13-features/`) |
| `21-app/03-data-and-api/` | Data schemas, API samples, DB join specs (was `07-data-and-api/`) |
| `21-app/04-design-diagrams/` | Mermaid diagrams, visual design specs (was `08-design-diagram/`) |
| `21-app/05-prompts/` | AI prompt samples and prompt folder structure (was `15-prompts/`) |
| `21-app/06-tasks/` | Roadmap, task breakdowns, feature planning (was `16-tasks/`) |
| `22-app-issues/` | Bug reports, issue tracking, RCAs (was `17-app-issues/`); 103 entries |

---

## Archive (99) — historical / retired content

Frozen material — never edited, never linked from active specs except as historical reference.

| Folder | Content |
|--------|---------|
| `99-archive/` | Archive root |
| `99-archive/governance-history/` | Original spec-index, reorganization plans, legacy readmes |
| `99-archive/duplicates/` | Stale duplicate folders preserved for traceability (`02-spec-authoring-guide-stale/`, `03-coding-guidelines-stale/`, `04-error-manage-spec-stale/`) |
| `99-archive/imported-error-management/` | Imported error-management specs (pre-canonicalization) |
| `99-archive/imported-misc/` | `e2-activity-feed/`, `generic-enforce/`, `upload-scripts/` |
| `99-archive/imported-powershell-integration/` | Pre-canonical PowerShell integration drop |
| `99-archive/wordpress/` | `wordpress-plugin/`, `wordpress-plugin-development/`, `wp-plugin-publish/` |
| `99-archive/01-overview-legacy/` | Legacy `01-overview/` content from pre-v3.2.0 layout |

---

## Governance & validation

| File / folder | Purpose |
|---------------|---------|
| `spec/00-overview.md` | Master spec index (created Phase 7) |
| `spec/99-consistency-report.md` | Root-level consistency health report |
| `spec/validation-reports/` | Time-stamped audits (e.g., `2026-04-22-reorganization-audit.md`) |
| `spec/.spec-folder-registry.json` | Authoritative folder list — protects against auto-cleanup pruning |

---

## Conventions

- **Numbering**: Folders use a 2-digit numeric prefix. Numbers are unique within their parent. Reserved gaps in core 01–17 are intentional.
- **Required files per folder**: Every active folder has `00-overview.md` and `99-consistency-report.md`. Stubs may have only `00-overview.md`.
- **File naming**: kebab-case, descriptive. Example: `02-class-architecture.md`.
- **Single source of truth**: each topic lives in exactly one folder.
- **Cross-references**: relative paths inside `spec/`; `mem://` URIs from memory; `spec/...` absolute paths from outside the tree.
- **Historical specs**: go to `99-archive/`, never deleted.
- **New top-level folders**: must be added to `spec/.spec-folder-registry.json` and protected by `scripts/spec-folder-guard.mjs`.

---

## Migration history (2026-04-22)

The repository was reorganized in 10 phases on 2026-04-22 from an ad-hoc layout (with duplicate-prefix collisions, app content polluting the core 01–20 range, and stale duplicates) to the canonical v3.2.0 structure. Authoritative records:

| Document | Location |
|----------|----------|
| Migration record (permanent) | `spec/99-archive/governance-history/2026-04-22-reorganization-plan.md` |
| Final audit | `spec/validation-reports/2026-04-22-reorganization-audit.md` (health 94/100, A) |
| Old → new path map | `mem://architecture/spec-tree-v3.2.0-layout` |
| Auto-cleanup safeguard | `mem://architecture/spec-folder-auto-cleanup-safeguard` + `scripts/spec-folder-guard-readme.md` |
| Live phase tracker (read-only) | `.lovable/spec-reorganization-plan-2026-04-22.md` |

---

## Important paths to update if you see them

These pre-v3.2.0 paths are **NOT VALID** and must be rewritten when encountered:

| Old (do not use) | New (canonical) |
|------------------|-----------------|
| `spec/01-overview/` | Content split: master index → `spec/00-overview.md`; legacy → `spec/99-archive/01-overview-legacy/` |
| `spec/03-coding-guidelines/`, `spec/06-coding-guidelines/` | `spec/02-coding-guidelines/` |
| `spec/04-error-manage-spec/` | `spec/03-error-manage/` |
| `spec/07-data-and-api/` | `spec/21-app/03-data-and-api/` |
| `spec/08-design-diagram/` | `spec/21-app/04-design-diagrams/` |
| `spec/09-design-system/` | `spec/07-design-system/` |
| `spec/10-macro-controller/` | `spec/21-app/02-features/macro-controller/` |
| `spec/11-chrome-extension/` | `spec/21-app/02-features/chrome-extension/` |
| `spec/12-devtools-and-injection/` | `spec/21-app/02-features/devtools-and-injection/` |
| `spec/13-features/` | `spec/21-app/02-features/misc-features/` |
| `spec/14-imported/` | Redistributed: `error-management/` → `spec/03-error-manage/`; `powershell-integration/` → `spec/11-powershell-integration/`; rest → `spec/99-archive/` |
| `spec/15-prompts/` | `spec/21-app/05-prompts/` |
| `spec/16-tasks/` | `spec/21-app/06-tasks/` |
| `spec/17-app-issues/`, `spec/02-app-issues/` | `spec/22-app-issues/` |
| `spec/02-spec-authoring-guide/` (the stale one) | `spec/01-spec-authoring-guide/` (canonical) |
| `spec/archive/` | `spec/99-archive/` |

If `pnpm run check:spec-folders` ever flags drift, run `pnpm run check:spec-folders:repair` to restore the structure.
