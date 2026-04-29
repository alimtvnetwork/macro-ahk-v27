# Phase 08 — Field Reference Wrapper

**Version:** 1.0.0
**Updated:** 2026-04-26
**Status:** ✅ Complete (backend); hover overlay UI deferred to Phase 09
alongside the Shadow-Root toolbar so binding picker and drop-zone share the
same render layer.

---

## Goal

Let a recorded `Step` reference one column of a previously-attached
`DataSource`, and let strings inside that step (URL, type-into value,
JS snippet, …) interpolate column values per-row at replay time.

Two orthogonal pieces ship in this phase:

1. **Persistence**: `FieldBinding (StepId, DataSourceId, ColumnName)`.
   `StepId` is `UNIQUE`, so each step has at most one bound column.
2. **Resolver**: `{{ColumnName}}` token substitution against a row record.

---

## Modules

| File | Role | LOC |
|------|------|-----|
| `src/background/recorder/field-reference-resolver.ts` | Pure `{{Column}}` token resolver + extractor | 70 |
| `src/background/recorder/field-binding-persistence.ts` | `FieldBinding` upsert/list/delete + column-existence validator | 158 |
| `src/background/handlers/recorder-field-binding-handler.ts` | `RECORDER_FIELD_BINDING_*` message handlers | 100 |
| `src/shared/messages.ts` | `MessageType` entries + request shapes | (edited) |
| `src/background/message-registry.ts` | Routes new message types to handlers | (edited) |

All within file caps; every helper function is under 8 lines.

---

## Resolver rules

- Token syntax: `{{ColumnName}}` — PascalCase identifier characters only.
- Whitespace inside braces is tolerated: `{{ Email }}` works.
- Backslash-escape emits the literal: `\{{NotAToken}}` → `{{NotAToken}}`.
- Unknown column ⇒ throws. Silent fallbacks would corrupt replay payloads
  (e.g., posting an empty email field instead of failing).

`extractReferencedColumns(template)` lists distinct token names in
first-seen order — used by the future binding picker UI to highlight
which DataSource columns a step depends on.

---

## Persistence

`upsertFieldBinding(slug, stepId, dataSourceId, columnName)`:

1. `validateFieldBinding` — reads the persisted `Columns` JSON of the
   target `DataSource` row and rejects if `columnName` is not in it.
   This prevents bindings that would always fail at replay.
2. `INSERT … ON CONFLICT(StepId) DO UPDATE` — keys on the `StepId UNIQUE`
   constraint declared in the Phase-04 schema.
3. `markDirty()` triggers the standard 5 s OPFS flush.

`deleteFieldBinding(slug, stepId)` removes a binding (used when the user
unbinds via the picker).

`listFieldBindings(slug)` returns every row in `FieldBindingId DESC`
order so the visualiser (Phase 10) can show the most-recent binding first.

---

## Message contract

```ts
// Upsert
{
  type: "RECORDER_FIELD_BINDING_UPSERT",
  projectSlug: string,
  stepId: number,
  dataSourceId: number,
  columnName: string,
}
// → { isOk: true, binding: PersistedFieldBinding }

// List
{ type: "RECORDER_FIELD_BINDING_LIST", projectSlug: string }
// → { bindings: PersistedFieldBinding[] }

// Delete
{ type: "RECORDER_FIELD_BINDING_DELETE", projectSlug: string, stepId: number }
// → { isOk: true }
```

---

## Tests

`src/background/recorder/__tests__/field-reference-resolver.test.ts` — 10 tests:

- Single-token substitution
- Multiple tokens with repeats
- Whitespace tolerance inside braces
- Backslash-escape emits literal
- Missing column ⇒ throws
- Token-free template passes through
- Determinism (same inputs ⇒ identical output)
- `extractReferencedColumns` distinct + first-seen order
- Escaped tokens excluded from extraction
- Empty-template extraction returns `[]`

Persistence + handler integration is covered by the existing
`recorder-db-schema.test.ts` (verifies the `FieldBinding` table, `StepId
UNIQUE`, and FK cascades) and will be exercised end-to-end in the
Phase-12 record→bind→persist→replay E2E.

---

## UI deferral

The "Add Field Reference" hover overlay + column picker live in the
content-script overlay layer that lands together with the Shadow-Root
toolbar in Phase 09. This avoids re-work: both bind to the same
DB shape and the same `RECORDER_FIELD_BINDING_*` message contract.
Per `mem://preferences/deferred-workstreams.md`, React component tests
are deferred — pure resolver + handler logic ships with full coverage now.
