# Memory: architecture/script-source-of-truth
Updated: 2026-03-22

## Standalone Scripts Architecture

All standalone scripts live under `standalone-scripts/` with a standardized structure:

```
standalone-scripts/
├── macro-controller/                  # Main automation controller
│   ├── src/                           # TypeScript source (THE source of truth)
│   │   ├── instruction.ts             # Project load manifest (→ dist/instruction.json)
│   │   └── ...
│   ├── dist/                          # Compiled artifacts (runtime seed source)
│   │   ├── macro-looping.js           # IIFE bundle
│   │   ├── macro-looping.css          # Compiled LESS styles
│   │   ├── templates.json             # Compiled HTML templates
│   │   ├── 03-macro-prompts.json      # Aggregated prompts
│   │   └── instruction.json           # Compiled project manifest
│   ├── 01-macro-looping.js            # Legacy reference file (OFF-LIMITS)
│   ├── script-manifest.json           # Build metadata
│   └── ...
├── xpath/                             # Global XPath utility library
│   ├── src/
│   │   ├── instruction.ts             # Project load manifest
│   │   └── ...
│   ├── dist/
│   │   ├── xpath.js                   # Compiled IIFE
│   │   └── instruction.json           # Compiled project manifest
│   └── script-manifest.json
└── prompts/                           # Prompt chain content
```

## Per-Project Dist Structure in Extension

After extension build, each project gets its own subfolder:

```
chrome-extension/dist/
├── projects/
│   └── scripts/
│       ├── xpath/
│       │   ├── xpath.js
│       │   ├── instruction.json
│       │   └── script-manifest.json
│       └── macro-controller/
│           ├── macro-looping.js
│           ├── macro-looping.css
│           ├── templates.json
│           ├── 03-macro-prompts.json
│           ├── instruction.json
│           └── script-manifest.json
```

## instruction.ts — Project Load Manifest

Each standalone script has `src/instruction.ts` that compiles to `dist/instruction.json`.
Defines the load order for injection:

1. **CSS** → injected into `<head>` first
2. **JSON configs** → loaded before JavaScript, injected as window globals
3. **JavaScript** → loaded last, with config/theme bindings
4. **Templates** → loaded alongside configs
5. **Prompts** → seeded into SQLite

## SQLite as Source of Truth

Scripts store **file paths** (not embedded code) in SQLite:
- `FilePath TEXT` — relative path like `projects/scripts/macro-controller/macro-looping.js`
- `IsAbsolute INTEGER` — 0 for relative (resolved via `chrome.runtime.getURL()`), 1 for absolute
- `Settings` table stores the extension base path for resolving relative paths
- Fallback: embedded `Code` field used if file path fetch fails

## Script Dependency System

Scripts declare dependencies via `script-manifest.json` and `instruction.json`:
- At runtime, the injection handler auto-resolves dependencies
- Global utilities (xpath, loadOrder: 1) injected before dependents (macro-controller, loadOrder: 2)

## Build Pipeline

1. `run.ps1 -d` auto-discovers all `standalone-scripts/*/src/` folders
2. Compiles `instruction.ts` → `instruction.json` via `scripts/compile-instruction.mjs`
3. Runs `npm run build:<folder-name>` for each
4. Extension Vite build copies ALL `dist/` artifacts into `chrome-extension/dist/projects/scripts/{name}/`
5. Seeder stores file paths pointing to per-project subfolders
6. At injection time, code is fetched from `chrome.runtime.getURL(filePath)`

## Rules

- **TypeScript source is canonical** — edit `src/`, never compiled output
- **01-macro-looping.js is legacy/OFF-LIMITS** — build and seeding automation must never touch it
- **dist/ artifacts** are the sole runtime inputs for seeding and deploy
- **instruction.ts** is the project manifest — defines what files to load and in what order
- **SQLite stores file paths** — code is fetched at injection time, not embedded
# Memory: architecture/script-source-of-truth
Updated: 2026-03-22

## Standalone Scripts Architecture

All standalone scripts live under `standalone-scripts/` with a standardized structure:

```
standalone-scripts/
├── macro-controller/                  # Main automation controller
│   ├── src/                           # TypeScript source (THE source of truth)
│   ├── dist/macro-looping.js          # Compiled IIFE (runtime seed source)
│   ├── 01-macro-looping.js            # Legacy reference file (do not edit/sync in build)
│   ├── script-manifest.json           # Dependency metadata
│   └── ...
├── xpath/                             # Global XPath utility library
│   ├── src/                           # TypeScript source (self-contained)
│   │   ├── index.ts                   # Entry: exposes window.XPathUtils
│   │   ├── core.ts                    # getByXPath, getAllByXPath
│   │   ├── find-element.ts            # Multi-method element search
│   │   ├── react-click.ts             # React-compatible click
│   │   └── logger.ts                  # Internal logger
│   ├── dist/xpath.js                  # Compiled IIFE
│   └── script-manifest.json           # isGlobal: true, loadOrder: 1
└── prompts/                           # Prompt chain content
```

## Script Dependency System

Scripts declare dependencies via `script-manifest.json`:

```json
// xpath: no dependencies, loaded first
{ "isGlobal": true, "dependencies": [], "loadOrder": 1 }

// macro-controller: depends on xpath
{ "isGlobal": false, "dependencies": ["xpath"], "loadOrder": 2 }
```

At runtime, the injection handler auto-resolves dependencies from `StoredScript.dependencies[]` and injects globals first.

## Build Pipeline

1. `run.ps1 -d` auto-discovers all `standalone-scripts/*/src/` folders
2. Runs `npm run build:<folder-name>` for each (e.g., `build:xpath`, `build:macro-controller`)
3. `build:macro-controller` compiles TypeScript to `dist/macro-looping.js` only (no legacy sync)
4. Extension Vite build runs `copyProjectScripts()` plugin → copies `dist/*.js` to `chrome-extension/dist/projects/scripts/`
5. Extension seeder embeds scripts via `?raw` imports from `standalone-scripts/*/dist/*`

## Dist Structure

```
chrome-extension/dist/
├── projects/
│   └── scripts/
│       ├── xpath.js              # Global utility
│       └── macro-looping.js      # Application script
```

## Rules

- **TypeScript source is canonical** — edit `src/`, never compiled output
- **dist/ artifacts are runtime inputs** for seeding and deploy
- **01-macro-looping.js is legacy/off-limits** — do not modify in build automation
- **xpath.js is fully self-contained** — no imports from macro-controller
- **New scripts** just need `src/` folder, `script-manifest.json`, and `build:<name>` npm script
- `build:macro` was renamed to `build:macro-controller` (matches folder name for auto-discovery)
