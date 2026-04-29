# 03 — Build Pipeline

> How projects are compiled, bundled, and deployed into the Chrome extension.

> **Output path note (2026-04-21):** The unpacked Chrome extension is now written
> directly to `./chrome-extension/` at the repo root — there is no longer a
> top-level `dist/` folder for the extension build. (`dist/` is reserved for the
> Lovable preview / web-app build.) The path is configured in
> `powershell.json` → `distDir = "chrome-extension"` and consumed by the
> PowerShell deploy modules and the Vite extension config.

---

## Build Overview

When `run.ps1 -d` executes the full deploy pipeline:

```
1. Auto-discover standalone-scripts/*/src/ folders
2. For each project:
   a. Compile instruction.ts → standalone-scripts/<name>/dist/instruction.json
   b. Compile LESS → standalone-scripts/<name>/dist/{name}.css (if less/ exists)
   c. Compile templates → standalone-scripts/<name>/dist/templates.json (if templates/ exists)
   d. Aggregate prompts → chrome-extension/prompts/macro-prompts.json
   e. TypeScript type-check (tsc --noEmit)
   f. Vite IIFE build → standalone-scripts/<name>/dist/{name}.js
3. Vite extension build (vite.config.extension.ts → outDir = chrome-extension/):
   a. copyProjectScripts() → chrome-extension/projects/scripts/{name}/
   b. Copy prompts → chrome-extension/prompts/
   c. Generate seed-manifest.json → chrome-extension/projects/seed-manifest.json
4. Extension boot:
   a. Seeder reads seed-manifest.json and stores metadata in chrome.storage.local
   b. reseedPrompts() wipes and re-inserts prompt data
5. At injection time:
   a. Read file paths from storage
   b. Fetch code via chrome.runtime.getURL(filePath)
   c. Inject in load order: CSS → configs → templates → JS
```

## Individual Build Commands

| Command | What It Does |
|---------|-------------|
| `npm run build:sdk` | Compile marco-sdk IIFE |
| `npm run build:{name}` | Compile a specific project |
| `npm run build:ext` | Build Chrome extension into `chrome-extension/` (requires SDK pre-built) |

## Instruction Compilation

```bash
node scripts/compile-instruction.mjs standalone-scripts/{project-name}
```

- Reads `src/instruction.ts`
- Extracts the default export object literal
- Writes `standalone-scripts/<name>/dist/instruction.json`

## LESS Compilation

If a project has a `less/` directory:

```
less/{name}.less → standalone-scripts/<name>/dist/{name}.css
```

LESS variables map to CSS custom properties for runtime theming.

## Template Compilation

If a project has a `templates/` directory:

```
templates/*.html → standalone-scripts/<name>/dist/templates.json
```

Templates are aggregated into a single JSON registry, keyed by filename (without extension).

## Vite IIFE Build

Each project's `src/index.ts` is compiled by Vite into a self-contained IIFE:

- **Format**: IIFE (no module imports at runtime)
- **Target**: ES2020
- **Output**: `standalone-scripts/<name>/dist/{name}.js`
- **Config**: `vite.config.sdk.ts` (for marco-sdk) or project-specific Vite config

The IIFE format prevents scope pollution and ensures scripts work in Chrome's MAIN world without module loader support.

## Extension Deployment

The `copyProjectScripts()` Vite plugin copies compiled artifacts into the unpacked Chrome extension folder:

```
standalone-scripts/{name}/dist/*
  → chrome-extension/projects/scripts/{name}/*
```

### Unpacked extension layout (load this folder in chrome://extensions → Load unpacked):

```
chrome-extension/
├── manifest.json
├── background/
│   └── index.js
├── assets/
│   └── icons/{icon-16,icon-48,icon-128}.png
├── projects/
│   ├── scripts/
│   │   ├── marco-sdk/
│   │   │   ├── marco-sdk.js
│   │   │   └── instruction.json
│   │   ├── xpath/
│   │   │   ├── xpath.js
│   │   │   └── instruction.json
│   │   └── macro-controller/
│   │       ├── macro-looping.js
│   │       ├── macro-looping.css
│   │       ├── macro-looping-config.json
│   │       ├── macro-theme.json
│   │       ├── templates.json
│   │       └── instruction.json
│   └── seed-manifest.json
├── prompts/
│   └── macro-prompts.json
└── ...
```

## Adding a New Project

1. Create `standalone-scripts/{name}/src/index.ts` and `src/instruction.ts`
2. Add `build:{name}` npm script in root `package.json`
3. The build pipeline auto-discovers and deploys it into `chrome-extension/projects/scripts/{name}/`

> **Note:** `instruction.ts` is the sole manifest — no separate `script-manifest.json` is needed.

## Web Accessible Resources

All project artifacts are declared in `manifest.json`:

```json
{
    "web_accessible_resources": [{
        "resources": [
            "projects/scripts/*/*",
            "projects/seed-manifest.json",
            "prompts/*"
        ],
        "matches": ["<all_urls>"]
    }]
}
```

This allows the injection pipeline to `fetch()` script files at runtime.
