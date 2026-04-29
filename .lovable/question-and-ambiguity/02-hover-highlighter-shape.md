# 02 — Hover highlighter shape

## Task
> Add a hover highlighter that highlights the exact StepGroup/SubGroup
> selection under my cursor in the editor UI.

## Ambiguity
"Highlighter" is visual-style ambiguous. Possible interpretations:

1. **Stronger row tint only** — bump existing `hover:bg-accent/50` to a
   crisper tint plus a left accent bar.
2. **Outlined ring** — add a `ring-1 ring-primary/40` around the exact
   hovered row, with the ring suppressed on ancestor rows so only the
   *innermost* node under the cursor lights up.
3. **Highlighter + breadcrumb hint** — option 2 plus a small parent
   path tooltip on the right of the row.

## Inference (chosen)
**Option 2** — accent left-bar + primary ring on the *exact* hovered
row, with a panel-level `hoveredId` so ancestor `<li>` wrappers do not
also light up when a deep child is hovered. This matches the user's
emphasis on "the **exact** ... selection under my cursor".

## Notes
- Implemented purely in `StepGroupLibraryPanel.tsx` (presentation only).
- Uses existing semantic tokens (`primary`, `accent`) — no new colors.
- No changes to selection / activation semantics.
