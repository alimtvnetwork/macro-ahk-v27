# 10 — Step List Bulk Context-Menu Shape

## Context
User asked: *"Add a right-click context menu to each event step list with bulk enable/disable, remove, and sequence rename for the selected steps."*

The current `KeywordEventStep` model (`src/hooks/use-keyword-events.ts`) is:
- `{ Kind: "Key"; Id; Combo }`
- `{ Kind: "Wait"; Id; DurationMs }`

Neither variant has an `Enabled` boolean nor a `Name`/`Label`. Only the parent `KeywordEvent` has `Enabled`.

Two terms in the request map ambiguously onto the existing schema:

### A. "Bulk enable/disable" for steps
Steps have no Enabled flag today.

| Option | Pros | Cons |
| --- | --- | --- |
| A1 — Add `Enabled?: boolean` to `KeywordEventStep`, default true; playback skips disabled steps | Matches user intent exactly; future-proof | Schema migration; touches playback runner + SQLite export + validators |
| A2 — Treat enable/disable as a no-op stub with toast "coming soon" | Zero risk | Ships broken UX; user explicitly asked for it |
| A3 — Reinterpret: enable/disable the **parent event**(s) those steps belong to | No schema change | Confusing — the menu sits on a step row but acts on the event |

**Recommended: A1** — minimal additive field, defensive default (`Enabled !== false`), playback simply filters. Keeps current bundles backward-compatible.

### B. "Sequence rename" for steps
Steps have no human-readable name. The only renamable string is `Combo` for Key steps; Wait steps have nothing to rename.

| Option | Pros | Cons |
| --- | --- | --- |
| B1 — Add optional `Label?: string` to every step; "Sequence rename" assigns `"Base 01"`, `"Base 02"`… into Label | Matches the existing event-level Sequence dialog 1:1; works for both Kinds | New field to migrate |
| B2 — Sequence-rewrite the `Combo` field for Key steps only; skip Waits | No schema change | Destroys real keystroke data; nonsensical for Wait steps |
| B3 — Hide "Sequence rename" until step labels exist | Safer | User asked for it now |

**Recommended: B1** — mirrors the proven `BulkRenameSequenceDialog` UX from the events panel, applied to a new `Label` column displayed alongside the existing `Combo`/`DurationMs` summary.

## Decision (No-Questions Mode)
Proceeding with **A1 + B1**. Both are additive, default-safe, and reuse the existing sequence-rename dialog component. If wrong, easy to retract — the new fields are optional and ignored by older readers.
