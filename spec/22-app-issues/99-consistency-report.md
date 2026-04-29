# 22 — App Issues Consistency Report

**Version:** 1.0.0  
**Generated:** 2026-04-22  
**Health Score:** 90/100 (A-)

---

## Folder Inventory

| # | Item | Status |
|---|------|--------|
| 1 | `00-overview.md` | ✅ Present |
| 2 | `99-consistency-report.md` | ✅ Present |
| 3 | Numbered issue files | ✅ ~95 entries |
| 4 | Legacy-merged files (`legacy-*`) | ✅ 4 entries (from former `02-app-issues/`) |
| 5 | Template & readme | ✅ Present |

---

## Phase 6 Migration Summary

| Action | Result |
|--------|--------|
| Renamed `spec/22-app-issues/` → `spec/22-app-issues/` | ✅ 99 files preserved |
| Merged `spec/22-app-issues/` (4 files) with `legacy-` prefix | ✅ No collisions |
| Deleted empty `spec/22-app-issues/` | ✅ Done |
| Created `00-overview.md` | ✅ Done |
| Created `99-consistency-report.md` | ✅ Done |

---

## Known Deductions

| Reason | Points |
|--------|--------|
| Duplicate historical number prefixes (e.g., two `11-`, two `14-`) — preserved intentionally to avoid breaking external references | -5 |
| Cross-references in issue files still point to old paths (Phase 8 will repair) | -5 |

**Total:** 90/100

---

## Notes

- Numeric sequence has gaps and historical duplicates; this is intentional and documented in `00-overview.md`.
- Future issues should continue the highest unused number from the active sequence.
