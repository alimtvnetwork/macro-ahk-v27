# Memory: architecture/riseup-sdk-namespace-implementation
Updated: 2026-03-25

## Implementation

Phase 1 of Issue 66 is complete. The `window.RiseupAsiaMacroExt` global object is now created by:

1. **SDK IIFE** (`standalone-scripts/marco-sdk/src/index.ts`): Creates `window.RiseupAsiaMacroExt = { Projects: {} }` as an extensible root container alongside `window.marco`.

2. **Project Namespace Builder** (`src/background/project-namespace-builder.ts`): New module that generates per-project IIFE strings registering `RiseupAsiaMacroExt.Projects.<CodeName>` with proxy methods delegating to `window.marco.*`. Sub-namespaces: `vars`, `urls`, `xpath`, `cookies`, `kv`, `files`, `meta`, `log`.

3. **Injection Handler** (`src/background/handlers/injection-handler.ts`): After all scripts are injected (Stage 4), a new Stage 5 calls `injectProjectNamespaces()` which iterates all projects in the dependency chain, computes `codeName` via `slug-utils.ts`, and injects the namespace IIFE into the MAIN world.

The `codeName` is derived from `project.codeName` (if set on StoredProject) or computed via `toCodeName(slugify(project.name))`.
