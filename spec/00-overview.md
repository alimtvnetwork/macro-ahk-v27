# Spec — Master Index

**Version:** 3.2.0  
**Status:** Active  
**Updated:** 2026-04-22  
**AI Confidence:** High  
**Ambiguity:** None

---

## Keywords

`spec`, `index`, `overview`, `documentation`, `governance`

---

## Scoring

| Criterion | Status |
|-----------|--------|
| `00-overview.md` present | ✅ |
| AI Confidence assigned | ✅ |
| Ambiguity assigned | ✅ |
| Keywords present | ✅ |
| Scoring table present | ✅ |

---

## Purpose

Master index of the entire `spec/` tree. Structure follows **Spec Authoring Guide v3.2.0** ([`01-spec-authoring-guide/`](./01-spec-authoring-guide/00-overview.md)).

The numbering convention is:

| Range | Meaning |
|-------|---------|
| `01–20` | **Core fundamentals** — universal, project-agnostic standards |
| `21+` | **App-specific** — content tied to the Riseup Asia Macro Chrome Extension |
| `99-archive/` | Retired content preserved for history |
| `validation-reports/` | Automated audit outputs |

---

## Folder Inventory

### Core Fundamentals (01–20)

| # | Folder | Purpose | Status |
|---|--------|---------|--------|
| 01 | [`01-spec-authoring-guide/`](./01-spec-authoring-guide/00-overview.md) | Authoring rules, templates, naming conventions | ✅ Active |
| 02 | [`02-coding-guidelines/`](./02-coding-guidelines/00-overview.md) | Cross-language coding standards | ✅ Active |
| 03 | [`03-error-manage/`](./03-error-manage/00-overview.md) | Error handling, codes, retrospectives, debugging | ✅ Active |
| 04 | [`04-database-conventions/`](./04-database-conventions/00-overview.md) | Schema, naming, ORM, REST format | ✅ Active |
| 05 | [`05-split-db-architecture/`](./05-split-db-architecture/00-overview.md) | Multi-database split-DB pattern | ✅ Active |
| 06 | [`06-seedable-config-architecture/`](./06-seedable-config-architecture/00-overview.md) | Declarative seeding from instruction manifests | ✅ Active |
| 07 | [`07-design-system/`](./07-design-system/00-overview.md) | Tokens, typography, layout, motion, components | ✅ Active |
| 08 | [`08-docs-viewer-ui/`](./08-docs-viewer-ui/00-overview.md) | Docs viewer UI spec | 🟡 Planned (stub) |
| 09 | [`09-code-block-system/`](./09-code-block-system/00-overview.md) | Code-block rendering & syntax highlighting | 🟡 Planned (stub) |
| 10 | [`10-research/`](./10-research/00-overview.md) | Research notes, prototypes, references | 🟡 Planned (stub) |
| 11 | [`11-powershell-integration/`](./11-powershell-integration/00-overview.md) | PowerShell deploy & integration scripts | ✅ Active |
| 12 | [`12-cicd-pipeline-workflows/`](./12-cicd-pipeline-workflows/00-overview.md) | CI/CD pipeline definitions & release procedure | 🟡 Planned (stub) |
| 14 | [`14-update/`](./14-update/00-overview.md) | Extension auto-update mechanics | 🟡 Planned (stub) |
| 17 | [`17-consolidated-guidelines/`](./17-consolidated-guidelines/00-overview.md) | Consolidated quick-reference guide | 🟡 Planned (stub) |

### App-Specific (21+)

| # | Folder | Purpose | Status |
|---|--------|---------|--------|
| 21 | [`21-app/`](./21-app/00-overview.md) | Riseup Asia Macro Chrome Extension | ✅ Active |
| 22 | [`22-app-issues/`](./22-app-issues/00-overview.md) | Issues, bugs, root-cause analyses | ✅ Active |

### Governance & History

| Folder | Purpose |
|--------|---------|
| [`99-archive/`](./99-archive/readme.md) | Retired content, legacy duplicates, governance history |
| `validation-reports/` | Automated audit outputs (Phase 10 will populate) |

---

## How to Read This Tree

1. **Need a coding rule?** → `02-coding-guidelines/`.
2. **Debugging an error?** → `03-error-manage/`, then `22-app-issues/` for app-specific cases.
3. **Adding a feature?** → `21-app/02-features/`.
4. **Authoring new docs?** → Read `01-spec-authoring-guide/01-folder-structure.md` first.

---

## Recent Migration

This structure was finalized on **2026-04-22** via a 10-phase reorganization. See:

- Phase tracker: `.lovable/spec-reorganization-plan-2026-04-22.md`
- Legacy index/plan: `99-archive/governance-history/`

---

## Cross-References

- Authoring guide: [`01-spec-authoring-guide/`](./01-spec-authoring-guide/00-overview.md)
- Memory index: `.lovable/memory/index.md`
- Project roadmap: `.lovable/plan.md`
