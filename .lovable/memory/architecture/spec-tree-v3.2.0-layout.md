---
name: Spec tree v3.2.0 layout
description: Authoritative folder map after the 2026-04-22 reorganization (core 01–17, app 21+, archive 99)
type: reference
---

# Spec Tree v3.2.0 Layout

**Effective:** 2026-04-22  
**Source of truth:** `spec/00-overview.md`  
**Authoring rules:** `spec/01-spec-authoring-guide/`

## Top-level map

| Range | Contents |
|-------|----------|
| `01–17` | **Core fundamentals** — universal, project-agnostic standards |
| `21–22` | **App-specific** — Riseup Asia Macro Chrome Extension + its issues |
| `99-archive/` | Retired content (legacy duplicates, governance history, WordPress imports) |
| `validation-reports/` | Automated audit outputs |

## Active core folders

| Slot | Folder | Status |
|------|--------|--------|
| 01 | `01-spec-authoring-guide/` | Active |
| 02 | `02-coding-guidelines/` | Active (engineering standards live here) |
| 03 | `03-error-manage/` | Active |
| 04 | `04-database-conventions/` | Active |
| 05 | `05-split-db-architecture/` | Active |
| 06 | `06-seedable-config-architecture/` | Active |
| 07 | `07-design-system/` | Active (renamed from former `09-design-system/`) |
| 08 | `08-docs-viewer-ui/` | Stub (Planned) |
| 09 | `09-code-block-system/` | Stub (Planned) |
| 10 | `10-research/` | Stub (Planned) |
| 11 | `11-powershell-integration/` | Active |
| 12 | `12-cicd-pipeline-workflows/` | Stub (Planned) |
| 14 | `14-update/` | Stub (Planned) |
| 17 | `17-consolidated-guidelines/` | Stub (Planned) |
| 21 | `21-app/` | Active (Chrome extension) |
| 22 | `22-app-issues/` | Active (RCAs, bug tracker) |

## App container layout (`21-app/`)

```
21-app/
├── 00-overview.md
├── 01-fundamentals.md
├── 02-features/
│   ├── chrome-extension/
│   ├── macro-controller/
│   ├── devtools-and-injection/
│   └── misc-features/
├── 03-data-and-api/
├── 04-design-diagrams/
├── 05-prompts/
└── 06-tasks/
```

## Migration map (old → new)

For any reference written before 2026-04-22:

| Old path | New path |
|----------|----------|
| `spec/01-overview/` | `spec/99-archive/01-overview-legacy/` |
| `spec/02-app-issues/` | `spec/22-app-issues/` (with `legacy-` prefix) |
| `spec/02-spec-authoring-guide/` (stale dup) | `spec/99-archive/duplicates/02-spec-authoring-guide-stale/` |
| `spec/03-coding-guidelines/` | `spec/02-coding-guidelines/` |
| `spec/04-error-manage-spec/` | `spec/03-error-manage/` |
| `spec/06-coding-guidelines/` | `spec/02-coding-guidelines/` |
| `spec/07-data-and-api/` | `spec/21-app/03-data-and-api/` |
| `spec/08-design-diagram/` | `spec/21-app/04-design-diagrams/` |
| `spec/09-design-system/` | `spec/07-design-system/` |
| `spec/10-macro-controller/` | `spec/21-app/02-features/macro-controller/` |
| `spec/11-chrome-extension/` | `spec/21-app/02-features/chrome-extension/` |
| `spec/12-devtools-and-injection/` | `spec/21-app/02-features/devtools-and-injection/` |
| `spec/13-features/` | `spec/21-app/02-features/misc-features/` |
| `spec/14-imported/error-management/` | `spec/03-error-manage/` (canonical superset) |
| `spec/14-imported/powershell-integration/` | `spec/11-powershell-integration/` (canonical superset) |
| `spec/14-imported/wordpress-*` | `spec/99-archive/wordpress/...` |
| `spec/15-prompts/` | `spec/21-app/05-prompts/` |
| `spec/16-tasks/` | `spec/21-app/06-tasks/` |
| `spec/17-app-issues/` | `spec/22-app-issues/` |

## Invariants going forward

- **Core (01–20)** = no app-specific content. Anything tied to the Chrome extension lives under `21-app/`.
- **App issues** = single canonical tracker at `22-app-issues/`.
- **Every top-level folder** has `00-overview.md` and `99-consistency-report.md`.
- **Number gaps** in the core range (13, 15, 16, 18, 19, 20) are reserved for future core topics — do not fill with app content.
- **`99-archive/`** is read-only history. Never re-promote from it.
