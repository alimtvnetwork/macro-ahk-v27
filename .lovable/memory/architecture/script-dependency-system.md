# Memory: architecture/script-dependency-system
Updated: 2026-03-21

## Script Dependency System

### Overview

Scripts can declare dependencies on other scripts via `StoredScript.dependencies[]` (array of script IDs). The injection handler (`script-resolver.ts`) auto-resolves dependencies before injection, ensuring correct load order.

### Type Extensions

`StoredScript` includes:
- `isGlobal?: boolean` — If true, loaded before all dependent scripts
- `dependencies?: string[]` — IDs of required scripts (loaded first)
- `loadOrder?: number` — Numeric sort key (lower = loaded first)

### Resolution Flow

1. Popup sends injection request with script entries
2. `resolveScriptBindings()` resolves entries to executable code
3. `resolveDependencies()` scans resolved scripts for `dependencies[]`
4. Missing dependencies are auto-resolved from the script store
5. All scripts sorted by `loadOrder` (xpath=1, macroController=2)
6. Deduplication prevents double-injection of globals

### Seeded Scripts

| Script | ID | isGlobal | loadOrder | Dependencies |
|--------|---|----------|-----------|--------------|
| xpath.js | `default-xpath-utils` | true | 1 | none |
| macro-looping.js | `default-macro-looping` | false | 2 | `[default-xpath-utils]` |

### Backward Compatibility

The macro-controller's `xpath-utils.ts` retains inline fallback code via `hasXPathUtils` flag. If xpath.js isn't loaded, the controller falls back to its bundled XPath functions.
