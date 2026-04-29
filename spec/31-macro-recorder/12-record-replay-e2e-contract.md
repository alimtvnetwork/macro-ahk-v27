# Phase 12 — Full Record→Replay E2E Contract

**Status:** ✅ Spec complete (executable Playwright suite deferred per
`mem://preferences/deferred-workstreams.md` — manual Chrome testing avoided).
**Date:** 2026-04-26

---

## Purpose

Document the **end-to-end behavioural contract** that the existing 83 unit
tests collectively guarantee, plus the additional integration assertions a
future Playwright run would verify if/when the deferred manual browser
testing is unblocked.

This file is the source of truth for "does the recorder work?" — every claim
below is backed either by a passing unit test or by an explicit pre-condition
documented for the integration phase.

---

## Scenario: One Project, One Data Source, Three Steps, Replay

### Setup (Pre-conditions)

| # | Precondition | Verified By |
|---|--------------|-------------|
| 1 | Project SQLite DB initialises with 10 tables (4 lookup + 5 business + JsSnippet) and 16 seed lookup rows | `recorder-db-schema.test.ts` (9 tests) |
| 2 | Toolbar shortcut `Ctrl/Cmd+Shift+R` registered in `manifest.json` and routes to `recorder-store.toggle()` | `recorder-store.test.ts` (18 tests) + manifest entry verified at build time |
| 3 | Per-project DB auto-provisioned by `handleSaveProject` | `recorder-db-schema.test.ts` |

### Act

1. **Start recording.** State: `Idle → Recording`. Session row written to
   `chrome.storage.local`. → `recorder-session-storage.test.ts` (7 tests).
2. **Capture click on `<button id="submit">`.** Content-script emits
   `XPATH_CAPTURED` with:
   - `XPathFull = //html/body/form/button[@id="submit"]`
   - `XPathRelative = ./button[@id="submit"]` anchored to `form`
   - `Strategy = "Id"`
   - `SuggestedVariableName = "Submit"`
   → `xpath-capture-engine.test.ts` (16 tests, jsdom-driven).
3. **Insert step.** `RECORDER_STEP_INSERT` writes one Step row + 2 Selector
   rows (`XPathFull` primary + `XPathRelative` anchored). Partial unique
   index ensures exactly one `IsPrimary = 1`. → `step-persistence-and-replay.test.ts`.
4. **Add CSV data source** with columns `[Email, Password]`.
   `RECORDER_DATA_SOURCE_ADD` parses RFC-4180 and stores `Columns` JSON +
   `RowCount`. → `data-source-parsers.test.ts` (9 tests).
5. **Bind step to column.** `RECORDER_FIELD_BINDING_UPSERT` validates that
   `ColumnName` exists in the DataSource's `Columns` JSON before inserting.
   → `field-reference-resolver.test.ts` (10 tests).
6. **Append InlineJs step.** Body `return Ctx.Row.Email.toLowerCase();`
   passes denylist; persisted as Step (StepKindId = 4, InlineJs = body).
   → `js-step-sandbox.test.ts` (21 tests).
7. **Stop recording.** State: `Recording → Idle`. Session deleted from
   `chrome.storage.local`.

### Assert (Replay Side)

| # | Assertion | Verified By |
|---|-----------|-------------|
| R1 | `RECORDER_STEP_LIST` returns 2 steps in `OrderIndex ASC` | `step-persistence-and-replay.test.ts` |
| R2 | `RECORDER_STEP_RESOLVE(stepId=1)` returns the primary `XPathFull` selector | `step-persistence-and-replay.test.ts` |
| R3 | `resolveStepSelector` recurses through `AnchorSelectorId` chain with cycle guard + depth cap 16 | `step-persistence-and-replay.test.ts` |
| R4 | `resolveFieldReferences("{{Email}}", {Email: "a@b"})` → `"a@b"` | `field-reference-resolver.test.ts` |
| R5 | `resolveFieldReferences("\\{{Email}}", …)` → `"{{Email}}"` (escape preserved) | `field-reference-resolver.test.ts` |
| R6 | Missing column throws (does not silently emit empty string) | `field-reference-resolver.test.ts` |
| R7 | `executeJsBody("return Ctx.Row.Email.toLowerCase();", …)` returns lowercased value | `js-step-sandbox.test.ts` |
| R8 | Mutation of `Ctx.Row` throws `JsExecError` | `js-step-sandbox.test.ts` |
| R9 | Forbidden token (`eval`, `window`, `document`, `chrome`, `process`, `import(`, `require(`, `Function`, `globalThis`, `__proto__`) rejected statically | `js-step-sandbox.test.ts` |
| R10 | Visualisation hook `useRecorderProjectData` issues exactly 3 messages on mount (`STEP_LIST`, `DATA_SOURCE_LIST`, `FIELD_BINDING_LIST`) and re-fires on rename | covered by hook implementation; integration assertion deferred |

### Cleanup

- `RECORDER_STEP_DELETE(stepId)` cascades and removes Selector +
  FieldBinding rows via `ON DELETE CASCADE`. → unit-tested.

---

## Coverage Matrix (Phase → Test File)

| Phase | Behavioural Contract | Test File | Tests |
|-------|---------------------|-----------|-------|
| 04 | Schema provisioning, idempotent re-init, FK constraints | `recorder-db-schema.test.ts` | 9 |
| 05 | State machine, capture/rename/delete, anchor rewrite | `recorder-store.test.ts` + `recorder-session-storage.test.ts` | 25 |
| 06 | XPath strategy ranking, anchor walk, label suggestion | `xpath-capture-engine.test.ts` | 16 |
| 07 | CSV/JSON parsing, persistence | `data-source-parsers.test.ts` | 9 |
| 08 | Token resolution, escape, missing-column rejection | `field-reference-resolver.test.ts` | 10 |
| 09 | Step + Selector CRUD, replay resolution, cycle guard | `step-persistence-and-replay.test.ts` | 18 |
| 10 | Hook + visualisation backend (rename + selectors-list) | `step-persistence-and-replay.test.ts` (additional 3 cases) | included above |
| 11 | InlineJs sandbox, snippet upsert/list/delete | `js-step-sandbox.test.ts` | 21 |
| **Total (background)** | | | **108** |
| | recorder-only subset | | **83** |

(Phases 06 + 04 unit tests live in their own files outside the
`recorder/__tests__/` folder; the recorder subfolder count is 83.)

---

## Deferred Integration Steps

These would run in a future Playwright suite once
`mem://preferences/deferred-workstreams.md` lifts the manual-Chrome ban:

1. Boot extension in headed Chromium with `--load-extension=chrome-extension/`.
2. Open Options page, create `TestProject`.
3. Navigate test tab to `tests/e2e/fixtures/recorder-form.html`.
4. Press `Ctrl+Shift+R`. Verify toolbar shows "Recording".
5. Click `#submit`, type into `#email`, select an option from `#country`.
6. Press `Ctrl+Shift+R` again to stop.
7. Re-open Options → `recorder` tab → assert 3 Step rows visible with the
   suggested variable names.
8. Drop CSV file onto data-source zone, bind step 2 to `Email` column.
9. Replay: invoke `RECORDER_STEP_RESOLVE` for each step, evaluate the
   returned XPath/Css against the live DOM, perform the action.
10. Assert form submission produces the bound row's values.

A skeleton spec exists at `tests/e2e/e2e-21-xpath-capture.spec.ts` covering
the capture-side strategy assertions in a hermetic browser context (no
extension load required).
