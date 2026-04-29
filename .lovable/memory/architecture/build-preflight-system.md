# Memory: architecture/build-preflight-system
Updated: 2026-03-26

## Modular Architecture (v2.0)

The build system was refactored from a monolithic 1758-line `run.ps1` into a ~270-line orchestrator that dot-sources 8 module files from `build/ps-modules/`:

| Module | Purpose |
|--------|---------|
| `utils.ps1` | Format-ElapsedTime, Test-Command, Refresh-Path, Install-NodeJS, Install-Pnpm, version parsing, pnpm command helpers |
| `pnpm-config.ps1` | Configure-PnpmStore, Configure-PnpMode, PnP NODE_OPTIONS management |
| `browser.ps1` | Profile detection, Deploy-Extension, Stop-BrowserProcesses, Download-ChromeForTesting |
| `preflight.ps1` | Invoke-PreflightCheck (dynamic import/require scanning) |
| `standalone-build.ps1` | Build-StandaloneScript, Build-AllStandaloneScripts (PARALLEL via Start-Job), Test-StandaloneDistArtifacts |
| `extension-build.ps1` | Install-ExtensionDependencies, Install-RootBuildDependencies, Build-Extension (with manifest validation) |
| `watch.ps1` | Start-WatchMode (FileSystemWatcher with debounce) |
| `help.ps1` | Show-Help |

## Parallel Standalone Builds

`Build-AllStandaloneScripts` launches each standalone script (macro-controller, marco-sdk, xpath) as a separate PowerShell `Start-Job`, collecting output and reporting results. This replaces the previous sequential `foreach` loop.

## Console encoding rule

All console output must use ASCII-safe characters only — no Unicode symbols. Use `[OK]`, `[FAIL]`, `[WARN]`, `[INFO]` prefixes instead of checkmarks/crosses.
