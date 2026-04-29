# Phase 11 — Inline JavaScript Step

**Status:** ✅ Complete
**Date:** 2026-04-26

## Goal

Allow the Macro Recorder to execute arbitrary user-authored JavaScript as a
first-class step kind (`StepKindId = 4`, `JsInline`) and persist a reusable
library of named snippets per project.

## Deliverables

| Artefact | Path |
|----------|------|
| Sandbox executor + validator | `src/background/recorder/js-step-sandbox.ts` |
| Snippet CRUD persistence     | `src/background/recorder/js-snippet-persistence.ts` |
| Schema: `JsSnippet` table    | `src/background/recorder-db-schema.ts` |
| Background message handler   | `src/background/handlers/recorder-js-handler.ts` |
| 4 new MessageType entries    | `src/shared/messages.ts` |
| Registry wiring              | `src/background/message-registry.ts` |
| Unit tests (17)              | `src/background/recorder/__tests__/js-step-sandbox.test.ts` |

## Sandbox Contract

- Body wrapped in `"use strict"` and compiled via `new Function("Ctx","Log",…)`.
- `Ctx = { Row, Vars }` is **deep-frozen** before invocation; mutation throws.
- `Log(msg)` captures into `LogLines` returned to caller.
- Static denylist rejects: `eval`, `Function`, `window`, `document`,
  `globalThis`, `chrome`, `process`, `import(`, `require(`, `__proto__`.
- Body length cap: **4000 chars**. Empty bodies rejected.
- Async bodies supported (returned Promise is awaited).
- Errors surfaced as `JsExecError`; static rejects as `JsValidationError`.

## Schema Addition

```sql
CREATE TABLE JsSnippet (
    JsSnippetId  INTEGER PRIMARY KEY AUTOINCREMENT,
    Name         TEXT    NOT NULL UNIQUE,
    Description  TEXT    NOT NULL DEFAULT '',
    Body         TEXT    NOT NULL,
    CreatedAt    TEXT    NOT NULL DEFAULT (datetime('now')),
    UpdatedAt    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IxJsSnippetName ON JsSnippet(Name);
```

`Name` is UNIQUE → upsert via `INSERT ... ON CONFLICT(Name) DO UPDATE`.

## Messages

| Type | Direction | Purpose |
|------|-----------|---------|
| `RECORDER_JS_SNIPPET_UPSERT` | content/options → bg | Create or replace snippet by `Name` |
| `RECORDER_JS_SNIPPET_LIST`   | content/options → bg | List snippets (Name ASC) |
| `RECORDER_JS_SNIPPET_DELETE` | content/options → bg | Drop one by `JsSnippetId` |
| `RECORDER_JS_STEP_DRYRUN`    | options → bg | Validate + execute body, return `{ReturnValue, LogLines, DurationMs}` |

`JsInline` Step rows are persisted via the existing
`RECORDER_STEP_INSERT` (with `StepKindId = 4`, `InlineJs = body`,
`Selectors = []`-allowed-via-CHECK). The body itself is validated by
`validateJsBody` invoked from the editor before send.

## Test Coverage (17 tests)

- 3 empty/oversize body rejections
- 9 forbidden-token rejections (eval, Function, window, document, globalThis,
  chrome, process, import, require)
- 1 valid body acceptance
- 5 executor semantics (return, Log capture, freeze enforcement, async, throw)
- 4 snippet CRUD (insert, upsert-replace, validation rejection, delete)

## Deferred

- Editor UI (Monaco-style snippet picker + dry-run button) — bundled with
  Shadow-Root toolbar work, see `mem://preferences/deferred-workstreams.md`.
- Workers-based hard preemption guard — future hardening.
