# Phase 14 — Step Chaining & Cross-Project Links

**Phase:** 14 of 14 (extends Phase 10 visualisation)
**Status:** 🟡 In progress
**Updated:** 2026-04-26

## Goal

Turn the per-project recorded-step list into an editable **chain**:

1. Each step renders as a card in a vertical chain inside the project section,
   connected by visible chain connectors.
2. Clicking a step opens **inline editing** (no modal) for: `Label` (name),
   `Description`, `Tags`, `IsDisabled`, `RetryCount`, `TimeoutMs`.
3. Each step exposes two **chain slots**:
   - `OnSuccessProjectId` — extension project to dispatch when the step succeeds.
   - `OnFailureProjectId` — extension project to dispatch when the step fails.
4. The replay executor honours `IsDisabled`, `RetryCount`, `TimeoutMs`, and
   dispatches the linked extension project on the corresponding tail.

> **Project scope:** "Project" here means a **Marco Recorder project inside the
> Chrome extension** (per-project SQLite registered via `project-handler.ts`).
> It is *not* a Lovable workspace project.

---

## Data model additions

Extend the existing `Step` table (Phase 9) with editable metadata and the two
link slots. Tags live in their own normalised table so we can group projects
in the cross-project picker by tag.

```sql
ALTER TABLE Step ADD COLUMN Description       TEXT;
ALTER TABLE Step ADD COLUMN IsDisabled        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Step ADD COLUMN RetryCount        INTEGER NOT NULL DEFAULT 0;
ALTER TABLE Step ADD COLUMN TimeoutMs         INTEGER;
ALTER TABLE Step ADD COLUMN OnSuccessProjectId TEXT;   -- extension project slug
ALTER TABLE Step ADD COLUMN OnFailureProjectId TEXT;   -- extension project slug

CREATE TABLE IF NOT EXISTS StepTag (
    StepTagId INTEGER PRIMARY KEY AUTOINCREMENT,
    StepId    INTEGER NOT NULL,
    Name      TEXT    NOT NULL,
    FOREIGN KEY (StepId) REFERENCES Step(StepId) ON DELETE CASCADE,
    UNIQUE (StepId, Name)
);
CREATE INDEX IF NOT EXISTS IxStepTagStep ON StepTag(StepId);
CREATE INDEX IF NOT EXISTS IxStepTagName ON StepTag(Name);
```

`OnSuccessProjectId` / `OnFailureProjectId` reference an **extension project
slug**, not a row in this per-project DB — cross-DB integrity is checked at
runtime by the replay executor, not by SQLite FK.

> Schema additions are applied via `recorder-db-schema.ts` `ALTER TABLE`
> statements wrapped in `IF NOT EXISTS` checks (idempotent migration).

---

## Backend message types

| Message | Handler | Purpose |
|---------|---------|---------|
| `RECORDER_STEP_UPDATE_META`  | `recorder-step-handler.ts` | Patch label/description/disabled/retry/timeout. |
| `RECORDER_STEP_TAGS_SET`     | `recorder-step-handler.ts` | Replace the full tag set for a step. |
| `RECORDER_STEP_LINK_SET`     | `recorder-step-handler.ts` | Set/clear `OnSuccessProjectId` or `OnFailureProjectId`. |
| `RECORDER_PROJECT_LIST_FOR_PICKER` | `project-handler.ts` | Returns extension projects grouped by tag for the picker. |

All four added to `MessageType` enum + `MessageRequest` union + registry.

---

## UI (frontend only — Options view)

| Component | Purpose |
|-----------|---------|
| `RecorderStepChain.tsx`     | Replaces `RecorderStepGraph` left-rail; renders steps as a vertical chain with connector arrows + success/failure branch glyphs. |
| `RecorderStepInlineEditor.tsx` | In-row form: name, description (textarea), tag chips (add/remove), disabled toggle, retry stepper, timeout input. Saves on blur. |
| `CrossProjectLinkPicker.tsx` | Popover listing extension projects grouped by tag with search; binds to a step's success or failure slot. |
| `RecorderVisualisationPanel.tsx` | Composes the above; replaces the old graph + detail split. |

All UI is presentation-only — business rules live in the message handlers.

---

## Replay executor behaviour

`live-dom-replay.ts` is extended to:

1. Skip steps with `IsDisabled = 1`.
2. Wrap each step's resolver+dispatch in a retry loop bounded by
   `RetryCount`. Each attempt is bounded by `TimeoutMs` (or the global
   default if `NULL`).
3. On terminal success of the step, if `OnSuccessProjectId` is set, enqueue
   a replay of that extension project after the current chain finishes.
4. On terminal failure (after all retries exhausted), emit the failure
   report (Phase 03 error-manage) **and** if `OnFailureProjectId` is set,
   dispatch that project; otherwise the chain halts.

Branch dispatch is a single `replayProject(slug)` call — the receiving
project runs through its own chain and cannot recursively call back into
the parent within the same execution to avoid loops (depth cap = 1 for
v1; documented in `12-record-replay-e2e-contract.md`).

---

## Diagrams

- `15-step-chain-data-model.mmd` — ER diagram of the new columns + StepTag.
- `15-step-chain-runtime-flow.mmd` — runtime branching flow during replay.

---

## Out of scope (v1)

- Drag-to-reorder steps (Phase 12 hardening).
- DAG visualisation across linked projects (only the local chain is drawn).
- Per-step variable scope sharing across linked projects (each linked
  project runs in its own variable scope).
