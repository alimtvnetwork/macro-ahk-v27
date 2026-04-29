# Database Diagrams — Index

Catalog of every Mermaid source in this folder, paired with its rendered
PNG/SVG outputs in [`../images/`](../images/). Re-run
`node scripts/render-db-diagrams.mjs` after editing any `.mmd` file to
refresh both raster and vector exports.

## Diagrams

| # | Source (`.mmd`) | PNG | SVG | Description |
|---|---|---|---|---|
| 01 | [`01-extension-db.mmd`](./01-extension-db.mmd) | [PNG](../images/01-extension-db.png) | [SVG](../images/01-extension-db.svg) | Extension-wide SQLite bundle (`logs.db` / `errors.db`). Full ERD for Sessions, Logs, Errors ↔ ErrorCodes, Prompts + categories, Updater\* tables, and SharedAsset history. |
| 02 | [`02-project-recorder-db.mmd`](./02-project-recorder-db.mmd) | [PNG](../images/02-project-recorder-db.png) | [SVG](../images/02-project-recorder-db.svg) | Per-project Macro Recorder DB (Phase 14). Steps, Selectors (with anchor self-ref), FieldBindings, DataSources, StepTags, ReplayRun + ReplayStepResult, plus chain columns. |
| 03 | [`03-step-group-library.mmd`](./03-step-group-library.mmd) | [PNG](../images/03-step-group-library.png) | [SVG](../images/03-step-group-library.svg) | Step Group Library hierarchy — Project → StepGroup (self-nesting, max depth 8) → Step, plus RunGroup `TargetStepGroupId` calls. |
| 04 | [`04-storage-layers.mmd`](./04-storage-layers.mmd) | [PNG](../images/04-storage-layers.png) | [SVG](../images/04-storage-layers.svg) | 4-tier storage overview (SQLite / IndexedDB / `localStorage` / `chrome.storage.local`) and which subsystem owns what. |
| 05 | [`05-overall-schema-erd.mmd`](./05-overall-schema-erd.mmd) | [PNG](../images/05-overall-schema-erd.png) | [SVG](../images/05-overall-schema-erd.svg) | **Overall schema ERD.** Combines Extension DB + per-project Recorder DB into one diagram. Shows cross-DB soft links (string `ProjectId` on Logs/Errors). Use this for a top-down picture; attribute lists are intentionally trimmed — see 01/02/03 for full columns. |
| 06 | [`06-key-tables-relationships.mmd`](./06-key-tables-relationships.mmd) | [PNG](../images/06-key-tables-relationships.png) | [SVG](../images/06-key-tables-relationships.svg) | **Key tables & relationships.** Focused subset of the most-traversed paths: Project → StepGroup → Step → Selector / FieldBinding / StepTag / ReplayStepResult ← ReplayRun. Best starting point when onboarding to recorder/replay code. |

## Conventions

All sources follow `mem://style/diagram-visual-standards`:
- PascalCase node labels and column names
- `erDiagram` for schemas; `flowchart TD` for layered overviews
- XMind-inspired dark aesthetic (the renderer uses Mermaid's `dark` theme)

## Render

```bash
npm run db:diagrams        # regenerate every PNG + SVG
npm run db:diagrams:check  # CI-friendly drift check (fails if any image is missing or older than its source)
# equivalent direct invocation:
node scripts/render-db-diagrams.mjs
```

`db:diagrams` writes both `.png` and `.svg` for every `.mmd` into
`../images/`. Uses `npx @mermaid-js/mermaid-cli` on demand — no permanent
dev dependency. Sequential and fail-fast (no retry/backoff), per
`mem://constraints/no-retry-policy`.

