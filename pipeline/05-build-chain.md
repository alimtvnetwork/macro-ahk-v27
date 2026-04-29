# 05 — Build Chain

## Build Order (Must Follow)

```
1. build:sdk              — Marco SDK (no dependencies)
2. build:xpath            — XPath utility (no dependencies)
3. build:macro-controller — Macro Controller (depends on SDK types)
4. build:extension        — Chrome Extension (bundles all of the above)
```

## Per-Project Build Details

### 1. Marco SDK (`build:sdk`)

```bash
check-axios-version
→ compile-instruction standalone-scripts/marco-sdk
→ tsc --noEmit -p tsconfig.sdk.json         # Type-check only
→ vite build --config vite.config.sdk.ts     # Bundle to dist/marco-sdk.js
→ generate-dts                               # Generate TypeScript declarations
```

**Output**: `standalone-scripts/marco-sdk/dist/marco-sdk.js` + `instruction.json` + `.d.ts`

### 2. XPath (`build:xpath`)

```bash
check-axios-version
→ compile-instruction standalone-scripts/xpath
→ tsc --noEmit -p tsconfig.xpath.json
→ vite build --config vite.config.xpath.ts
```

**Output**: `standalone-scripts/xpath/dist/xpath.js` + `instruction.json`

### 3. Macro Controller (`build:macro-controller`)

```bash
check-axios-version
→ build:prompts                              # Aggregate prompt files → JSON
→ build:macro-less                           # Compile Less → CSS
→ build:macro-templates                      # Compile HTML templates → JSON
→ compile-instruction standalone-scripts/macro-controller
→ build:seed-manifest                        # Generate seed-manifest.json
→ check-version-sync                         # All version files must match
→ tsc --noEmit -p tsconfig.macro.build.json
→ vite build --config vite.config.macro.ts
→ sync-macro-controller-legacy               # Copy to legacy filename
```

**Output**: `standalone-scripts/macro-controller/dist/macro-looping.js` + CSS + templates + instruction.json

### 4. Chrome Extension (`build:extension`)

```bash
check-axios-version
→ lint-const-reassign
→ compile-instruction (×3: sdk, xpath, controller)
→ check-standalone-dist                      # Verify all dist/ folders exist
→ check-version-sync                         # Final version alignment check
→ vite build --config vite.config.extension.ts
    ├── Vite plugin: copyProjectScripts()    # Copies standalone dists into extension dist
    └── Vite plugin: generates seed-manifest.json
```

**Output**: `chrome-extension/dist/` — complete extension ready for `Load unpacked`

## compile-instruction.mjs

Converts `src/instruction.ts` → `dist/instruction.json`:
- Strips TypeScript syntax
- Evaluates the default export
- Writes pure JSON to dist

Usage: `node scripts/compile-instruction.mjs standalone-scripts/{name}`

## Vite Build Configs

Each project has its own Vite config at the repo root:

| Config | Builds |
|--------|--------|
| `vite.config.sdk.ts` | Marco SDK |
| `vite.config.xpath.ts` | XPath |
| `vite.config.macro.ts` | Macro Controller |
| `vite.config.extension.ts` | Chrome Extension (main entry) |
| `chrome-extension/vite.config.ts` | Chrome Extension (alternative, used by ext workspace) |

All configs produce IIFE or UMD bundles (no ES modules) since the output
runs in Chrome extension contexts (content scripts, background service worker).
