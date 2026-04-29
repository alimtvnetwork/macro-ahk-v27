# 04 — CSV input flow: row strategy & coercion rules

## Task
> Add an import flow to let me upload CSV input data and map it into
> variables/parameters for the selected group.

## Ambiguity
The recorded CSV constraint is "≤ 5 MB / 10 000 rows, fully
in-memory" (mem://workflow/no-questions-mode decision). Open shape
questions:

1. **Row strategy**
   - (a) **Single-row apply** — pick one row from the file; that row's
     mapped values become the group's bag.
   - (b) **Iterate** — run the group once per row, scheduled by a
     batch runner. Requires runner + state machine work.
   - (c) **Bag-of-arrays** — flatten the whole file into the bag
     (`{ Email: [...], Age: [...] }`).

2. **Variable name source**
   - Use header verbatim (breaks placeholder syntax for "First Name").
   - Sanitise + dedupe + let the user override (chosen).

3. **Type coercion**
   - Always string vs auto vs explicit per-column.

4. **CSV dialect** — comma vs semicolon, quoted fields, embedded
   newlines, BOM, line endings.

## Inference (chosen)
- **Row strategy (a) — single-row apply.** Matches the user's wording
  ("apply it to the selected group"), keeps the bag a flat object
  (compatible with `setGroupInput`), and avoids a runner change.
  Iterate-mode is logged for follow-up.
- **Variable names**: sanitise headers via `suggestVariableName`, fill
  duplicates with `_2`/`_3`, allow inline rename, validate against
  `^[A-Za-z_][A-Za-z0-9_]{0,63}$`.
- **Coercion**: per-column dropdown — `Auto` (default) /  `String` /
  `Number` / `Boolean` / `JSON`. `Auto` covers the 90% case while
  surfacing explicit knobs when needed.
- **Dialect**: comma + semicolon auto-detected from the first line;
  RFC 4180 quoting; CRLF/LF/CR; UTF-8 BOM stripped; soft warnings for
  short / long rows.

## Notes
- New modules: `csv-parse.ts` (RFC 4180-ish parser) +
  `csv-mapping.ts` (row → bag with coercion).
- New UI: `src/components/options/CsvInputDialog.tsx`.
- Wired into `StepGroupLibraryPanel`: header `CSV` button next to the
  existing `JSON` button, plus an "Import from CSV…" dropdown item on
  every row.
- Reuses the existing `setGroupInput` plumbing — no schema or runner
  change required.
- Tests: 28 new (15 parser + 13 mapping). Full step-library suite =
  118 / 118 green.

## Follow-ups (out of scope here)
- Iterate-mode (run group once per CSV row) belongs to the batch
  runner / RunBatchDialog workstream.
