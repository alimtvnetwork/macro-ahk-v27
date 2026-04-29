# 22 — App Issues

**Version:** 1.0.0  
**Status:** Active  
**Updated:** 2026-04-22  
**AI Confidence:** High  
**Ambiguity:** None

---

## Keywords

`app-issues`, `bugs`, `rca`, `root-cause-analysis`, `chrome-extension`

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

Single canonical tracker for **all app-specific issues, bugs, and root-cause analyses** for the Riseup Asia Macro Chrome Extension.

This folder consolidates the previous two issue trackers:

- **`spec/22-app-issues/`** (former canonical) — renamed to this folder.
- **`spec/22-app-issues/`** (4 loose files) — merged in with the `legacy-` filename prefix to preserve provenance.

---

## File Naming

- **Numbered issues** (`NN-short-description.md`) — sequential by discovery order.
- **`legacy-*.md`** — files migrated from the former `02-app-issues/` folder; not part of the numeric sequence.
- **Subfolders** — for issues that grew beyond a single file (`free-credits-detect/`, etc.).
- **`template.md`** — boilerplate for new issue write-ups.
- **`readme.md`** — internal author notes.

> Some duplicate prefixes exist in the historical numbering (e.g., two `11-`, two `14-`). These are not renumbered to preserve external references; the second occurrence is suffixed with a version tag (e.g., `-v6.55.md`).

---

## Inventory Summary

| Category | Count |
|----------|-------|
| Numbered issues (active sequence) | ~95 |
| Legacy migrated files (`legacy-*`) | 4 |
| Subfolders | varies |
| Support files (`readme.md`, `template.md`) | 2 |
| **Total entries** | 103 |

---

## Cross-References

- App overview: [`../21-app/00-overview.md`](../21-app/00-overview.md)
- Error management contract: [`../03-error-manage/`](../03-error-manage/00-overview.md)
- Retrospectives (cross-tool): [`../03-error-manage/01-error-resolution/03-retrospectives/`](../03-error-manage/01-error-resolution/03-retrospectives/00-overview.md)
