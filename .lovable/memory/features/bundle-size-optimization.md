# Memory: features/bundle-size-optimization
Updated: 2026-04-21

Bundle-splitting wins applied to keep the options/popup main chunk lean:

1. **jszip lazy-loaded** — `src/lib/sqlite-bundle.ts` and `src/background/handlers/logging-export-handler.ts` now use a `loadJSZip()` helper that does `await import("jszip")`. Splits ~97 kB into its own chunk, only loaded when import/export/diagnostic-zip runs.
2. **Developer guide data lazy-loaded** — `src/lib/developer-guide-bundle.ts` exports `exportKnowledgeBase()` as **async**; the ~70 kB markdown bundle (`developer-guide-data.generated.ts`) is dynamically imported only when the user clicks "Export AI Knowledge Base" in `ProjectDetailView.tsx`. Caller updated to `async () => { ... }`.
3. **@dnd-kit deferred** — `ChainBuilder` is now `lazy()`-imported in `AutomationView.tsx` with a Suspense fallback. dnd-kit (~80 kB across `core`/`sortable`/`utilities`) only loads when the chain editor opens.
4. **Mixed-import warning fixed** — Extracted `SyncBadge` from `LibraryView.tsx` into `src/components/options/SyncBadge.tsx`. `ProjectScriptSelector` and `PromptManagerPanel` now import `SyncBadge` from the new file, allowing `LibraryView` to remain cleanly dynamically-imported by `Options.tsx`. `LibraryView` re-exports `SyncBadge` for backward compatibility.

**Verification**: `vite build` produces dedicated chunks: `jszip.min-*.js` (97 kB), `developer-guide-data.generated-*.js` (70 kB), `ChainBuilder-*.js` (8.6 kB). Zero mixed-import warnings.
