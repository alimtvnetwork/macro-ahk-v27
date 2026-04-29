# Phase 10 — Project Visualisation

**Phase:** 10 of 12
**Status:** ✅ Complete
**Updated:** 2026-04-26

## Goal
Surface persisted Macro Recorder data inside the existing per-project Options UI: ordered Step graph, selected-step detail (selectors + binding), variable rename.

## Modules
| File | Purpose |
|------|---------|
| `src/hooks/use-recorder-project-data.ts` | Loads `Step[]`, `DataSource[]`, `FieldBinding[]` for one project (parallel `RECORDER_*_LIST` calls); exposes `loadSelectors(stepId)` + `reload()`. |
| `src/components/options/recorder/RecorderStepGraph.tsx` | Left-rail ordered Step list with select/delete. |
| `src/components/options/recorder/RecorderStepDetail.tsx` | Right-pane: variable rename input, selector cards (primary highlighted, anchor refs surfaced), bound DataSource column. |
| `src/components/options/recorder/RecorderVisualisationPanel.tsx` | Lazy-loaded panel composing both, with DataSource summary chips. |
| `src/components/options/ProjectDetailView.tsx` | New `"recorder"` overflow tab (Activity icon) wired with `Suspense`. |

## Backend additions
- `RECORDER_STEP_RENAME` — calls `updateStepVariableName(slug, stepId, newName)`. Server-side check rejects empty + uniqueness collision before the partial unique index would.
- `RECORDER_STEP_SELECTORS_LIST` — returns `Selector` rows for one Step (the resolver call only returns the final expression, not the rows the UI needs to display).

Both wired in `MessageType` enum, `MessageRequest` union, `recorder-step-handler.ts`, and `message-registry.ts`.

## Tests
3 new tests added to `step-persistence-and-replay.test.ts` (rename happy path, duplicate-name rejection, empty-name rejection). **18/18 passing**. React component tests are deferred per `mem://preferences/deferred-workstreams.md`.

## Verification
- `bunx tsc --noEmit -p tsconfig.json` — clean.
- Vitest — 18/18 passing.

## Out of scope
- Drag-to-reorder (Phase 12 hardening).
- Inline JS editing (Phase 11).
