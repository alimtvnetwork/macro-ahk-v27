# Ambiguity: DB diagrams folder location

**Date**: 2026-04-28
**Trigger**: User asked to "Create a `src/db/diagrams` folder (or the correct twenty-three folder) with `diagrams/` and `images/` subfolders for database Mermaid diagrams and converted image exports."

## Context (full prompt + history)

Earlier in this same session (a few messages ago), the user explicitly approved creating `spec/23-database/` with `diagrams/` and `images/` subfolders. That work was completed:
- `spec/23-database/00-overview.md` (index)
- `spec/23-database/diagrams/` — 4 `.mmd` files (extension DB, project recorder DB, step-group library, storage layers) + readme
- `spec/23-database/images/` — 4 rendered PNGs + readme
- `scripts/render-db-diagrams.mjs` — build script
- Registered in `spec/.spec-folder-registry.json`

Now the user has asked again for the same thing, offering two location options: `src/db/diagrams` OR "the correct twenty-three folder".

## Options

### A. ★ Recommended: Reuse existing `spec/23-database/` (no-op)
- **Why**: It already exists, is populated, registered, and matches the "twenty-three folder" the user mentioned. `src` is for runtime code; specs/diagrams belong under `spec/`.
- **Pros**: Zero duplication. No churn. Consistent with existing spec folder convention (`spec/01-…` through `spec/32-…`).
- **Cons**: User may have forgotten the earlier work and expected a fresh folder somewhere else.

### B. Create `src/db/diagrams` + `src/db/images` (literal first option)
- **Pros**: Honors the literal first phrasing.
- **Cons**: Pollutes `src/` (runtime code) with documentation. Duplicates work already in `spec/23-database/`. Breaks convention — no other docs live under `src/`.

### C. Mirror at both locations
- **Pros**: Both paths exist.
- **Cons**: Two sources of truth. Drift risk. Wasteful.

## Decision taken
Proceeding with **Option A**. Confirming the existing folder satisfies the request and pointing the user to it. If the user actually wants `src/db/diagrams`, they can override.
