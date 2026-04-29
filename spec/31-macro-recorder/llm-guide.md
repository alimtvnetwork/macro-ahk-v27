# LlmGuide — Macro Recorder

**Version:** 1.0.0
**Updated:** 2026-04-26
**Audience:** AI agents (Lovable, Cursor, Claude Code, etc.) modifying or
extending the Macro Recorder subsystem.
**Authority:** This document is the canonical entry point. Read this **first**
before touching any file under `src/background/recorder/`,
`src/content-scripts/xpath-*.ts`, or `src/components/options/recorder/`.

---

## 1. What the Macro Recorder Does

A user opens any web page, hits **Ctrl/Cmd+Shift+R**, performs a sequence of
clicks / keystrokes / selects, then stops. The extension persists every
interaction as a `Step` row with 1..N `Selector` rows in a per-project SQLite
database. The user can later:

- bind any step to a column of a CSV / JSON data source (`{{ColumnName}}`),
- attach an inline JavaScript step (`StepKindId = 4`) for custom logic,
- visualise the ordered Step graph in the Options page,
- replay the recorded sequence against a target page using the
  deterministic XPath / Css / Aria selector resolved from the highest-quality
  strategy that still matches.

---

## 2. File Map

| Concern | Authoritative File |
|--------|--------------------|
| **Schema (PascalCase, 9 + 1 tables)** | `src/background/recorder-db-schema.ts` |
| Provisioning (per-project DB) | `src/background/project-db-manager.ts` (`initProjectDb`) |
| **Recording state machine** | `src/background/recorder/recorder-store.ts` |
| Session mirror (chrome.storage.local) | `src/background/recorder/recorder-session-storage.ts` |
| Toolbar shortcut | `src/background/shortcut-command-handler.ts` |
| **XPath capture** | `src/content-scripts/xpath-recorder.ts` + `xpath-anchor-strategies.ts` + `xpath-label-suggester.ts` |
| Data-source parsers (CSV/JSON) | `src/background/recorder/data-source-parsers.ts` |
| Data-source persistence | `src/background/recorder/data-source-persistence.ts` |
| **Field binding (`{{Column}}`)** | `src/background/recorder/field-reference-resolver.ts` + `field-binding-persistence.ts` |
| **Step + Selector persistence** | `src/background/recorder/step-persistence.ts` |
| **Replay resolver** (cycle-safe, depth 16) | `src/background/recorder/replay-resolver.ts` |
| **Inline JS sandbox** | `src/background/recorder/js-step-sandbox.ts` |
| Snippet library | `src/background/recorder/js-snippet-persistence.ts` |
| Options-page visualisation | `src/components/options/recorder/RecorderVisualisationPanel.tsx` (+ `RecorderStepGraph`, `RecorderStepDetail`) |
| Options-page hook | `src/hooks/use-recorder-project-data.ts` |
| Background handlers | `src/background/handlers/recorder-{step,data-source,field-binding,js}-handler.ts` |
| Message types (PascalCase enum) | `src/shared/messages.ts` (`RECORDER_*`) |
| Registry wiring | `src/background/message-registry.ts` |
| Tests | `src/background/recorder/__tests__/*.test.ts` (83 unit tests) |
| Spec | `spec/31-macro-recorder/` (12 phase docs + ERD + glossary) |

---

## 3. Non-Negotiable Conventions

These rules are enforced project-wide. Violating them breaks builds or fails
review.

1. **PascalCase everywhere on the data plane** — table names, column names,
   JSON object keys, and lookup-table values. Code-side enums mirror the
   table values and live next to the schema (`recorder-db-schema.ts`).
2. **Primary keys** — `INTEGER PRIMARY KEY AUTOINCREMENT` named `[Table]Id`.
   Foreign keys reuse the exact PK column name.
3. **No `any`, no `unknown`** in checked-in code (see
   `mem://standards/unknown-usage-policy`). Use precise interfaces or
   discriminated unions.
4. **Files capped at 80–100 LOC** (200 hard cap). Functions under 8 lines
   where reasonable. No nested `if`. No swallowed errors — every `catch`
   must call `RiseupAsiaMacroExt.Logger.error` (see
   `mem://standards/error-logging-via-namespace-logger`).
5. **All booleans stored as TINYINT** (`0`/`1`) with `Is`/`Has` prefix.
6. **Lookup tables for every Kind/Status/Category column.** No string enums
   in business tables.
7. **`SelectorKindId = 2` (XPathRelative) is the only kind that may have a
   non-null `AnchorSelectorId`.** Enforced by CHECK constraint and by the
   `insertSelectorsForStep` validator.
8. **Exactly one `IsPrimary = 1` selector per Step.** Enforced by the
   partial unique index `IxSelectorPrimaryPerStep`.
9. **Inline JS bodies pass through `validateJsBody` before any storage or
   execution.** Denylist: `eval`, `Function`, `window`, `document`,
   `globalThis`, `chrome`, `process`, `import(`, `require(`, `__proto__`.
   Body cap 4000 chars.
10. **Never use Supabase auth/storage anywhere** (see
    `mem://constraints/no-supabase`). The recorder uses per-project SQLite
    only.

---

## 4. End-to-End Recording Flow

```
User presses Ctrl/Cmd+Shift+R
      │
      ▼
shortcut-command-handler.ts → recorder-store.ts (Idle → Recording)
      │
      ▼ chrome.storage.local mirror via recorder-session-storage.ts
      ▼
content-script: xpath-recorder.ts captures user clicks
      │
      ▼ XPATH_CAPTURED message {XPathFull, XPathRelative, AnchorXPath,
      │                         Strategy, SuggestedVariableName}
      ▼
background: handleRecorderStepInsert
      │
      ├─ insertStepRow() → Step row (StepKindId, VariableName, Label, …)
      └─ insertSelectorsForStep() → 1..N Selector rows
                                    (exactly one IsPrimary = 1)
      ▼
Optional bindings:
  • RECORDER_DATA_SOURCE_ADD  → DataSource row (Csv | Json)
  • RECORDER_FIELD_BINDING_UPSERT → FieldBinding (StepId UNIQUE → DataSourceId,
                                    ColumnName)
  • RECORDER_JS_SNIPPET_UPSERT → JsSnippet library entry
      ▼
Stop recording → Recording → Idle, session persisted.

Replay path:
  RECORDER_STEP_RESOLVE(StepId)
    → listSelectorsForStep
    → resolveStepSelector(selectors)        // cycle-safe, depth cap 16
    → returns ResolvedSelector { Kind, Expression }
  caller evaluates Expression on target document.
```

---

## 5. Adding a New Step Kind (Worked Example)

1. **Add row** to the `StepKind` lookup-table seed in
   `recorder-db-schema.ts` (`INSERT OR IGNORE INTO StepKind …`).
2. **Add code-side mirror** to the `StepKindId` const object in the same
   file.
3. **If the new kind needs extra columns**, add them to the `Step` table DDL
   with an appropriate CHECK so they only populate for the right kind (see
   the `InlineJs` precedent: `CHECK (InlineJs IS NULL OR StepKindId = 4)`).
4. **Validate the draft** in `validateStepDraft` (`step-persistence.ts`).
5. **Surface in the visualisation** by extending `RecorderStepDetail.tsx`.
6. **Write tests** in `step-persistence-and-replay.test.ts` against the
   in-memory `RECORDER_DB_SCHEMA`.

Do **not** branch on `StepKindId` outside `step-persistence.ts` and the
visualisation layer. Replay resolution is selector-driven and kind-agnostic.

---

## 6. Adding a New Selector Strategy

`SelectorKind` lookup table currently holds `XPathFull`, `XPathRelative`,
`Css`, `Aria`. To add a new one (say, `Pierce`):

1. Append `(5, 'Pierce')` to the `SelectorKind` seed and to `SelectorKindId`
   const.
2. Implement `capturePierce(el)` in `src/content-scripts/` returning a
   string Expression.
3. Wire it into `xpath-recorder.ts`'s capture pipeline so the new kind can
   be marked `IsPrimary = 1` when it has the highest specificity.
4. Add a resolver branch in `replay-resolver.ts` (it currently passes
   through Expression untouched for Css/Aria — Pierce will be the same).
5. Add unit tests covering: capture-side selection, replay-side fallback,
   determinism across reloads.

---

## 7. Common Pitfalls (Read Before Editing)

| Pitfall | Why It Bites | Correct Pattern |
|---------|--------------|-----------------|
| Using `lowercase_snake` keys in JSON payloads | Breaks the PascalCase contract; the data-source parsers and field resolver assume PascalCase | Use `ColumnName`, `RowCount`, etc. |
| Mutating `Ctx.Row` inside an InlineJs body | Ctx is deep-frozen — throws `JsExecError` | Compute a new value and `return` it |
| Calling `chrome.storage.local.set` directly from recorder code | Bypasses the session mirror's debounce + schema | Use `recorder-session-storage.ts` |
| Storing roles on `Profile` / `User` table | Privilege-escalation vector | Always use a separate `UserRole` table — see global rule (n/a in recorder, but holds project-wide) |
| Adding a new `RECORDER_*` message and forgetting `message-registry.ts` | Handler never fires; silent failure | Update both `messages.ts` (enum + payload union) **and** `message-registry.ts` (Map entry) in the same edit |
| Adding a `setInterval` on the Options page | Burns CPU when tab is hidden — see PERF-10..13 | Pause on `document.hidden`; use `useVisibilityPausedInterval` |
| Auto-starting a content script on inject | See PERF-R4 — capture overhead even when idle | Gate with `chrome.runtime.onMessage` listener |

---

## 8. Test Strategy

- **Unit tests** (`src/background/recorder/__tests__/`) run against an
  in-memory sql.js database loaded with the canonical
  `RECORDER_DB_SCHEMA`. They exercise every CHECK, FK CASCADE, and partial
  unique index — **always reuse the `freshDb()` helper** instead of
  hand-rolling DDL.
- **Component tests are deferred** (see
  `mem://preferences/deferred-workstreams.md`).
- **Manual Chrome testing is also deferred.** When verifying changes,
  prefer: (a) running `bunx vitest run src/background/recorder`,
  (b) `bunx tsc --noEmit`, (c) reading the network/console logs from the
  Lovable preview.

Current coverage: **83 / 83** tests passing across:
- `data-source-parsers.test.ts` (9)
- `recorder-session-storage.test.ts` (7)
- `recorder-store.test.ts` (18)
- `field-reference-resolver.test.ts` (10)
- `js-step-sandbox.test.ts` (21)
- `step-persistence-and-replay.test.ts` (18)

---

## 9. Quick Reference — Message Catalogue

| Message | Payload | Returns |
|---------|---------|---------|
| `RECORDER_DATA_SOURCE_ADD` | `{projectSlug, filePath, mimeKind, rawText}` | `{dataSource}` |
| `RECORDER_DATA_SOURCE_LIST` | `{projectSlug}` | `{dataSources}` |
| `RECORDER_FIELD_BINDING_UPSERT` | `{projectSlug, stepId, dataSourceId, columnName}` | `{binding}` |
| `RECORDER_FIELD_BINDING_LIST` | `{projectSlug}` | `{bindings}` |
| `RECORDER_FIELD_BINDING_DELETE` | `{projectSlug, stepId}` | `{isOk: true}` |
| `RECORDER_STEP_INSERT` | `{projectSlug, draft: StepDraft}` | `{step, selectors}` |
| `RECORDER_STEP_LIST` | `{projectSlug}` | `{steps}` |
| `RECORDER_STEP_DELETE` | `{projectSlug, stepId}` | `{isOk}` |
| `RECORDER_STEP_RESOLVE` | `{projectSlug, stepId}` | `{resolved}` |
| `RECORDER_STEP_RENAME` | `{projectSlug, stepId, newVariableName}` | `{step}` |
| `RECORDER_STEP_SELECTORS_LIST` | `{projectSlug, stepId}` | `{selectors}` |
| `RECORDER_JS_SNIPPET_UPSERT` | `{projectSlug, draft: {Name, Description, Body}}` | `{snippet}` |
| `RECORDER_JS_SNIPPET_LIST` | `{projectSlug}` | `{snippets}` |
| `RECORDER_JS_SNIPPET_DELETE` | `{projectSlug, jsSnippetId}` | `{isOk}` |
| `RECORDER_JS_STEP_DRYRUN` | `{body, context: {Row, Vars}}` | `{result: {ReturnValue, LogLines, DurationMs}}` |

---

## 10. Where to Read Next

1. `spec/31-macro-recorder/03-data-model.md` — full ERD + column-by-column
   table reference.
2. `spec/31-macro-recorder/02-phases.md` — phase-by-phase implementation
   history (12 phases, all ✅).
3. `spec/32-app-performance/01-performance-findings.md` — perf budget the
   recorder must respect (PERF-R1..R7 + inherited PERF-9..13).
4. `mem://preferences/deferred-workstreams.md` — what is intentionally
   skipped this iteration (UI shadow-root toolbar, manual browser testing,
   React component tests).
