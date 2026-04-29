# 11 — Keyword-events ZIP import: matching policy

**Request**: "Implement importing a keyword-events ZIP by reading
`keyword-events.db` and updating the selected events in my app."

## Ambiguities

### A. How do imported rows match selected events?
- **Option 1 — Match by Uid (Id)**. Pros: stable, exact, never wrong row.
  Cons: re-exporting from another browser produces fresh Ids; nothing matches.
- **Option 2 — Match by Keyword (case-insensitive, trimmed)**. Pros: works
  across machines/installs; matches user mental model ("update events with
  the same keyword"). Cons: ambiguous if the selection has duplicate keywords.
- **Option 3 — Match positionally** (i-th selected ← i-th imported). Pros:
  trivial. Cons: extremely fragile; surprising silent corruption.

**Decision**: try Uid first, fall back to Keyword (case-insensitive). Skip
imported rows with no match. Duplicate keywords in selection → first match
wins, others left untouched (count surfaced in the result toast).

### B. Which fields are overwritten?
All editable fields present in `keyword-events.db`: `Keyword`, `Description`,
`Enabled`, `Steps`, `Target`, `Tags`, `Category`, `PauseAfterMs`. `Id` is
preserved. Sort order is NOT changed (would re-shuffle the user's list).

### C. What if selection is empty?
Disable the "Update from ZIP…" menu item and show a short hint in the dialog.

### D. Confirmation?
Yes — show a dry-run summary (matched / unmatched / would-update) and require
an explicit "Apply update" click. Mirrors the bulk-delete confirm dialog.
