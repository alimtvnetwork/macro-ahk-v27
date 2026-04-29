# 01 — Import/Export "screen": dedicated route vs. promoted section

## Original task

> Add an import/export screen that lets me export the selected StepGroup library as a zip bundle and import it back.

## Spec / current state reference

- `src/components/options/StepGroupLibraryPanel.tsx` already wires both **Export selected** (calls `runStepGroupExport`, triggers a browser zip download) and **Import ZIP** (file picker → `runStepGroupImport`) inside its top toolbar.
- `src/background/recorder/step-library/export-bundle.ts` and `import-bundle.ts` are the pure modules covered by passing tests.
- The app currently has a single route (`/` → `Index.tsx`) that mounts `StepGroupLibraryPanel` directly. There is no router, sidebar, or multi-page shell wired in `src/pages/`.

## Point of confusion

"Screen" is ambiguous in this codebase. Three plausible readings:

| # | Interpretation | What it would mean |
|---|----------------|--------------------|
| A | A dedicated route / page (e.g. `/import-export`) only for bundle ops | New router, navigation, page component |
| B | A first-class panel section inside the library page | Extract import/export into its own `<Card>` block above/beside the tree, with clearer copy + drop zone, while leaving the existing toolbar buttons as quick actions |
| C | Status quo — toolbar buttons already satisfy "import/export screen" | No work needed |

## Options & trade-offs

### Option A — Dedicated route
- **Pros**: Clear separation of concerns; room for batch-mode wizards (preview manifest before import, conflict resolution UI, etc.); mirrors what most desktop apps do.
- **Cons**: Requires introducing a router (none exists yet); duplicates selection state across two screens (the user must select groups in the library, then navigate elsewhere to export them — friction); current single-page architecture makes this disruptive for one feature.

### Option B — Promoted section in existing page (RECOMMENDED)
- **Pros**: Discoverable (a labeled "Import / Export" card with description, file drop zone, and explicit buttons reads as a "screen" within the page); zero routing churn; selection stays co-located with the action; lets us add UX niceties (drag-and-drop file zone, bundle preview snippet, last-import summary) without uprooting anything; reversible if the user later wants a true route.
- **Cons**: Still one URL; slightly more vertical space on the library page.

### Option C — Do nothing
- **Pros**: Zero work, tests already cover the logic.
- **Cons**: Ignores the user's explicit ask; the existing toolbar buttons are easy to miss because they sit alongside 5+ other controls.

## Recommendation

**Option B**. Add an "Import / Export" card to `StepGroupLibraryPanel`:

1. Section header + 1-line description of what a bundle is.
2. **Export side** — shows `N selected` count, export button, and (when a previous export ran) a small "Last export: filename · groups · steps" line.
3. **Import side** — full drop zone (file-drag + click-to-pick), accepts `.zip`, shows last-import summary (groups added, steps added, renames-on-conflict count).
4. Keep the existing toolbar buttons as quick shortcuts — no behavior is removed.

This delivers a recognisable "screen" experience without inventing a router or breaking the current single-page flow. If the user later confirms they wanted a true route, promoting this card to its own page is a 10-minute extraction.

## Decision proceeded with

Implementing Option B.
