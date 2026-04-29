# 21 — App: Riseup Asia Macro Extension (Chrome)

**Version:** 1.0.0  
**Status:** Active  
**Updated:** 2026-04-22  
**AI Confidence:** High  
**Ambiguity:** None

---

## Keywords

`app`, `chrome-extension`, `macro-controller`, `riseup-asia`, `manifest-v3`

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

This folder contains **all app-specific documentation** for the Riseup Asia Macro Chrome Extension. Cross-cutting fundamentals (coding guidelines, error management, design system, etc.) live in the core `01-` through `17-` slots. Anything that exists *because* the app exists lives here.

---

## Subfolder Inventory

| # | Folder | Purpose |
|---|--------|---------|
| 01 | `01-fundamentals.md` | High-level app architecture, lifecycle, and extension boundaries |
| 02 | `02-features/` | Feature-by-feature specs (macro-controller, chrome-extension, devtools-and-injection, misc-features) |
| 03 | `03-data-and-api/` | App data models, API contracts, JSON schemas, request/response samples |
| 04 | `04-design-diagrams/` | Architectural diagrams specific to the app |
| 05 | `05-prompts/` | Prompt templates used by the app |
| 06 | `06-tasks/` | Task definitions and macro task specifications |

---

## Cross-References

- App issues: [`spec/22-app-issues/`](../22-app-issues/00-overview.md)
- Coding guidelines (apply to this app): [`spec/02-coding-guidelines/`](../02-coding-guidelines/00-overview.md)
- Design system (used by this app): [`spec/07-design-system/`](../07-design-system/00-overview.md)
- Error management contract: [`spec/03-error-manage/`](../03-error-manage/00-overview.md)
