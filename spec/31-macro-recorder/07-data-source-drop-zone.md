# Phase 07 — Data Source Drop Zone

**Version:** 1.0.0
**Updated:** 2026-04-26
**Status:** ✅ Complete (backend); UI overlay deferred to Phase 09 with the
Shadow-Root toolbar render layer.

---

## Goal

Let a recording session attach external tabular data — CSV or JSON — that
later Phase-08 `FieldBinding` rows can reference by column name. Each
attached file becomes one `DataSource` row in the project's per-project
SQLite database.

---

## Modules

| File | Role | LOC |
|------|------|-----|
| `src/background/recorder/data-source-parsers.ts` | Pure CSV + JSON parsers → `ParsedDataSource` | 121 |
| `src/background/recorder/data-source-persistence.ts` | Insert/list rows in `DataSource` table via `initProjectDb(slug)` | 95 |
| `src/background/handlers/recorder-data-source-handler.ts` | `RECORDER_DATA_SOURCE_ADD` + `LIST` message handlers | 80 |
| `src/shared/messages.ts` | New `MessageType` entries + request shapes | (edited) |
| `src/background/message-registry.ts` | Routes new message types to handlers | (edited) |

All new files are well under the 200-line cap; every helper function is
under 8 lines.

---

## Parser rules

### CSV (RFC 4180 subset)

- First non-blank line is the header.
- Comma separator; double-quote field wrapping; `""` escapes a literal `"`.
- CRLF and LF both accepted; blank lines are ignored from `RowCount`.
- Header field whitespace is trimmed.

### JSON

- Must parse to a non-empty array of plain objects (no scalars / no arrays
  inside the top-level array).
- `Columns` = union of keys across all rows in **first-seen** order so the
  layout is deterministic regardless of which row introduces a new key.

Both parsers are pure (no DOM / no async / no chrome) and produce the same
`ParsedDataSource` shape:

```ts
{
  DataSourceKindId: 1 | 2,    // Csv | Json (from recorder-db-schema.ts)
  Columns: string[],
  RowCount: number,
}
```

---

## Persistence

`insertDataSource(projectSlug, filePath, parsed)`:

1. `initProjectDb(slug)` — guaranteed to apply `RECORDER_DB_SCHEMA` from
   Phase 04 if the DB is fresh, otherwise just opens the existing handle.
2. Inserts into `DataSource (DataSourceKindId, FilePath, Columns, RowCount)`.
   `Columns` is JSON-encoded so the round-trip preserves order.
3. `mgr.markDirty()` schedules the standard 5 s OPFS flush.
4. Reads back the just-inserted row by `FilePath DESC LIMIT 1` and returns
   the `PersistedDataSource` record (numeric `DataSourceId`, ISO `CreatedAt`).

`listDataSources(projectSlug)` returns every row in `DataSourceId DESC`
order so the most-recent attachment surfaces first in any UI.

---

## Message contract

```ts
// Add
{
  type: "RECORDER_DATA_SOURCE_ADD",
  projectSlug: string,
  filePath: string,           // user-visible name, e.g. "leads.csv"
  mimeKind: "csv" | "json",
  rawText: string,            // file contents read by the caller
}
// → { isOk: true, dataSource: PersistedDataSource }

// List
{ type: "RECORDER_DATA_SOURCE_LIST", projectSlug: string }
// → { dataSources: PersistedDataSource[] }
```

Both types are wired through `src/background/message-registry.ts` next to
the existing XPath recorder routes.

---

## Tests

`src/background/recorder/__tests__/data-source-parsers.test.ts` — 9 tests:

- CSV header + row count
- CRLF line endings
- Quoted fields with embedded comma + escaped quote
- Blank-line tolerance
- Empty-input rejection
- JSON array of objects + key-union ordering
- Non-array JSON rejection
- Empty JSON array rejection
- Non-object JSON rows rejection (numbers, arrays, null)

Persistence + handler integration coverage is exercised by the existing
`recorder-db-schema.test.ts` (which already verifies the `DataSource`
table + lookup seed) and will be extended in the Phase-12 E2E pass.

---

## UI deferral

Per `mem://preferences/deferred-workstreams.md`, React component tests are
deferred. The drop-zone overlay itself binds tightly to the Shadow-Root
toolbar landing in Phase 09 — building it in isolation now would risk
re-work, so we ship the backend contract first and the UI lands together
with the Step persistence contract.
