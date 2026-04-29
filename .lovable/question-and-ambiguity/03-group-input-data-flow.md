# 03 — Import flow for per-group JSON input data

## Task
> Add an import flow to let me paste or upload JSON input data and
> apply it to the selected group during recording or execution.

## Ambiguity
The recorder/runner pipeline currently has no first-class "input
variables" per StepGroup. The Type step payload uses a `{{Email}}`
template syntax (see `seedExampleData` in `use-step-library.ts`),
suggesting variable expansion is anticipated, but no storage layer
binds variables to a specific group.

Open points:

1. **Scope**
   - (a) Per-group: JSON object stored against a single `StepGroupId`.
   - (b) Per-project: shared across all groups in a project.
   - (c) Per-run: ephemeral, never persisted.

2. **Persistence**
   - Add a new `StepGroupInputs` table in sql.js — invasive schema change.
   - Use a sibling `localStorage` namespace keyed by `StepGroupId` —
     cheap, preview-friendly, mirrors how the panel persists today.

3. **Application semantics**
   - "Apply" = set the active group's input bag in memory so the next
     run / recording uses it (the runner can read it via context).
   - Validation: must be a JSON **object** (not array / scalar) so keys
     can map to `{{Variable}}` placeholders.

## Inference (chosen)
- **Scope (a)**: Per-group. Matches the user's wording "the selected
  group" exactly.
- **Persistence**: Sibling `localStorage` bag at
  `marco.step-library.inputs.v1` — `Record<StepGroupId, JsonObject>`.
  Keeps the schema migration out of scope; the runner can pick it up
  via a context accessor when wired.
- **Application semantics**: Three sources accepted in the dialog —
  paste textarea, file upload (`.json`, ≤ 1 MB), and a "Load from
  current value" prefill. Saved JSON object becomes the group's input
  bag. Cleared via an explicit "Clear" button.
- Validation: parse with `JSON.parse`, reject anything that is not a
  plain object, surface line/col on parse error.

## Notes
- New module: `src/background/recorder/step-library/group-inputs.ts`
  (storage + types + validate helpers).
- Hook surface: `useStepLibrary` exposes `GroupInputs`,
  `setGroupInput`, `clearGroupInput`.
- New UI: `src/components/options/GroupInputsDialog.tsx`. Reachable
  from a new "Apply input data" button in the right pane *and* a
  dropdown menu item in each row.
- Reuses semantic tokens; no new colors.
- Future runner wiring: when the executor reads `GroupPath`, it can
  resolve the bag for `rootGroupId` from this same storage key. Not
  done here — out of scope per "presentation only" rule for UI tasks.
