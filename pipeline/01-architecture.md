# 01 — Project Architecture

## Repository Layout

```
repo-root/
├── src/                          # Shared source (types, components, background scripts)
├── chrome-extension/             # Chrome extension entry point
│   ├── manifest.json             # Extension manifest (carries version)
│   ├── src/                      # Extension-specific source
│   └── dist/                     # Build output (gitignored)
├── standalone-scripts/           # Independently built JS bundles
│   ├── marco-sdk/                # SDK library (built first — others depend on it)
│   ├── xpath/                    # XPath utility script
│   └── macro-controller/        # Main automation controller
├── scripts/                      # Build & validation Node.js scripts
├── .github/workflows/            # CI and Release GitHub Actions
├── changelog.md                  # Human-maintained changelog
└── package.json                  # Root — contains all build/lint/test commands
```

## Dependency Graph (Build Order)

```
marco-sdk  ──┐
              ├──→  macro-controller
xpath     ──┘       (depends on SDK types)
              │
              ▼
        chrome-extension
        (bundles all standalone dist/ into dist/projects/scripts/)
```

**Rule**: SDK must be built before macro-controller and xpath.
The extension build copies all standalone `dist/` folders into its own `dist/`.

## Key Concepts

### Standalone Scripts
Each standalone script in `standalone-scripts/{name}/` is a self-contained project with:
- `src/instruction.ts` — declarative manifest (name, version, assets, entry points)
- `dist/` — compiled output (JS bundle + instruction.json + assets)
- Its own Vite config at the repo root (`vite.config.{name}.ts`)
- Its own TypeScript config (`tsconfig.{name}.json`)

### instruction.ts → instruction.json
Every standalone script has an `instruction.ts` that is compiled to `instruction.json`
at build time by `scripts/compile-instruction.mjs`. This JSON file is the sole source
of truth for what assets belong to that script. The extension's Vite plugin reads it
during build to copy the right files.

### Chrome Extension Build
The extension's Vite config includes a custom plugin (`copyProjectScripts`) that:
1. Reads each standalone script's `dist/instruction.json`
2. Copies all dist artifacts into `chrome-extension/dist/projects/scripts/{name}/`
3. Generates a `seed-manifest.json` listing all bundled projects

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript 5 |
| Bundler | Vite 5 |
| Package manager | pnpm 9 |
| Runtime | Node.js 20 |
| Test framework | Vitest |
| Linter | ESLint 9 (flat config) + eslint-plugin-sonarjs |
| CI platform | GitHub Actions |
| CSS (extension UI) | Tailwind CSS v3 |
| CSS (standalone) | Less → compiled CSS |

## PowerShell Pipeline Configuration (`powershell.json`)

The PowerShell build orchestrator (`run.ps1` + `scripts/ps-modules/*.ps1`) is fully
data-driven by `powershell.json` at the repo root. **No file paths are hardcoded
in the modules** — change `powershell.json` to point the script at any layout.

### Schema

| Key | Type | Default | Semantics |
|-----|------|---------|-----------|
| `projectName` | string | `"Chrome Extension"` | Display name shown in the banner. |
| `rootDir` | string | `"."` | Repo root. Used for `git pull`, root-level `npm install`, and standalone-script builds. Resolved relative to `run.ps1`. |
| `extensionDir` | string | `"."` | **Where the extension's `package.json`, `manifest.json`, `vite.config.ts`, and `node_modules` live.** All `Push-Location`, `pnpm install`, `pnpm run build`, and `.npmrc`/`.pnp.cjs` writes target this directory. Use `"."` when the extension lives at the repo root, or a sub-folder name (e.g. `"chrome-extension"`) when it is nested. |
| `distDir` | string | `"dist"` | Build output folder, **resolved relative to `extensionDir`**. The deploy step copies `<extensionDir>/<distDir>/` into the target browser profile. |
| `buildCommand` | string | `"npm run build"` | Production build command, executed inside `extensionDir`. |
| `devCommand` | string | `"npm run dev"` | Dev/watch command, executed inside `extensionDir`. |
| `installCommand` | string | `"npm install"` | Dependency install, executed inside `extensionDir`. |
| `cleanPaths` | string[] | `["dist", "node_modules"]` | Paths removed by `-f` / `-r`, **resolved relative to `extensionDir`**. |
| `defaultProfile` | string | `"Default"` | Browser profile used when `-pr` is omitted. |
| `browserExePath` | string | `""` | Optional override for the Chrome/Edge executable. |
| `chromeUserDataDir` | string | `%LOCALAPPDATA%\Google\Chrome\User Data` | Chrome profile root. |
| `edgeUserDataDir` | string | `%LOCALAPPDATA%\Microsoft\Edge\User Data` | Edge profile root. |
| `prerequisites.node` | bool | `true` | Validate Node.js is installed. |
| `prerequisites.pnpm` | bool | `false` | Validate pnpm is installed (enables pnpm-specific code paths). |
| `usePnp` | bool | `false` | Prefer pnpm Plug'n'Play. Auto-falls back to `isolated` linker on Node ≥ 24 or cross-drive stores. |
| `pnpmStorePath` | string | `"E:/.pnpm-store"` | Content-addressable pnpm store location. |
| `requiredPackages` | string[] | `["vite","tailwindcss","autoprefixer"]` | Packages preflight checks for inside `extensionDir/node_modules`. |
| `standaloneArtifacts` | object | — | Lists `standalone-scripts/<folder>` outputs the build verifies after compilation. |

### Path resolution rules

1. **All relative paths in `powershell.json` are resolved against `run.ps1`'s
   directory** (`$ScriptDir`), not the caller's CWD.
2. `extensionDir` is the **anchor** for almost every filesystem operation —
   `package.json`, `manifest.json`, `node_modules`, `.npmrc`, `.pnp.cjs`,
   `vite.config.ts`, `src/` (for watch mode), and `<distDir>/`.
3. `distDir` is **always** joined onto `extensionDir`. It is never absolute.
4. `rootDir` is used only for repo-wide actions (git, root `node_modules`,
   `scripts/*.mjs` build guards, standalone-script builds).

### Startup guard

Immediately after resolving config values, `run.ps1` validates that
`$ExtensionDir` exists on disk. If it does not, the script aborts with a
**STARTUP GUARD FAILURE** banner that prints:

- The exact resolved path that failed
- The `extensionDir` value read from `powershell.json`
- Resolution steps pointing back to the config file

This prevents the confusing `Push-Location: Cannot find path` errors that
occurred when `extensionDir` pointed at a non-existent sub-folder.

### Common layouts

**Extension at repo root** (this project):
```json
{ "rootDir": ".", "extensionDir": ".", "distDir": "dist" }
```

**Extension in a sub-folder**:
```json
{ "rootDir": ".", "extensionDir": "chrome-extension", "distDir": "dist" }
```
→ Build output lands in `chrome-extension/dist/`.

**Monorepo with custom dist name**:
```json
{ "rootDir": ".", "extensionDir": "packages/extension", "distDir": "build" }
```
→ Build output lands in `packages/extension/build/`.

### Pointing at a different layout

1. Edit `powershell.json` → set `extensionDir` (and optionally `distDir`).
2. Run `.\run.ps1 -pf` (preflight) to verify the path resolves and required
   packages are present.
3. Run `.\run.ps1 -d` end-to-end.

No PowerShell module changes are required — the entire pipeline reads
`$script:ExtensionDir` and `$script:DistDir` from this config.
