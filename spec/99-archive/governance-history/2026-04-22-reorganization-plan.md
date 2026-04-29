# Spec Reorganization — 2026-04-22

**Migration ID:** `reorg-2026-04-22-v3.2.0`  
**Authority:** Spec Authoring Guide v3.2.0 (`spec/01-spec-authoring-guide/`)  
**Execution mode:** 10 phases, one per "next" instruction  
**Live tracker:** `.lovable/spec-reorganization-plan-2026-04-22.md`

---

## What changed

The `spec/` tree was restructured from an ad-hoc layout (with 5 duplicate-prefix collisions, app content polluting the core 01–20 range, and 3 stale duplicate folders) into the canonical v3.2.0 structure:

- **Core fundamentals** (01–17) — universal standards.
- **App-specific** (21+) — Chrome extension content under `21-app/`.
- **Issues** consolidated at `22-app-issues/`.
- **Archive** at `99-archive/` for retired content.
- **Validation reports** at `validation-reports/`.

## Phase summary

| Phase | Action | Result |
|-------|--------|--------|
| 1 | Eliminate duplicates & stale copies | 4 legacy folders archived |
| 2 | Create new core stubs | 6 stub folders (`08`, `09`, `10`, `12`, `14`, `17`) |
| 3 | Rename core folders | `09-design-system/` → `07-design-system/` |
| 4 | Redistribute `14-imported/` | WordPress + duplicates archived; loose files → `02-coding-guidelines/imported/` |
| 5 | Create `21-app/` & migrate | 7 app folders relocated under `21-app/` |
| 6 | Consolidate `22-app-issues/` | 99 + 4 files merged with `legacy-` prefix |
| 7 | Root governance | `00-overview.md` + `99-consistency-report.md` created; legacy index/plan archived |
| 8 | Cross-reference repair | 337 path rewrites across 199 files |
| 9 | Memory & policy sync | `mem://index` updated; `mem://architecture/spec-tree-v3.2.0-layout` written |
| 10 | Final validation | (pending) |

## Recovery notes

Lovable's auto-cleanup process repeatedly reverted folder moves between phases (suspected: empty-looking renamed dirs not tracked). Workaround: re-execute moves at the start of each new phase before doing new work. This was needed at the start of Phases 5, 7, and 8.

## Replacement map

See `mem://architecture/spec-tree-v3.2.0-layout` for the authoritative old→new path table.

## Files

| Item | Location |
|------|----------|
| Original `readme.md` | `spec/99-archive/governance-history/readme-legacy.md` |
| Original `spec-index.md` | `spec/99-archive/governance-history/spec-index.md` |
| Original `spec-reorganization-plan.md` | `spec/99-archive/governance-history/spec-reorganization-plan.md` |
| Live phase tracker | `.lovable/spec-reorganization-plan-2026-04-22.md` |
| Memory layout doc | `.lovable/memory/architecture/spec-tree-v3.2.0-layout.md` |
| Final audit | `spec/validation-reports/2026-04-22-reorganization-audit.md` (Phase 10) |
