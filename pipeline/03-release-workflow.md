# 03 — Release Workflow

**File**: `.github/workflows/release.yml`
**Triggers**: Push to `release/**` branches (e.g. `release/v2.119.0`) **or** `v*` tags (e.g. `v2.119.0`)
**Concurrency**: Never cancelled — every release commit must produce a GitHub Release

## Environment

```yaml
env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true
```

## Pipeline Architecture

The release pipeline mirrors the CI parallel job structure with an added packaging + release job:

```
┌──────────┐
│  setup   │  ← Checkout, resolve version, lint (root + ext), test
└────┬─────┘
     │
     ├─────────────────────┐
     │                     │
┌────▼─────┐        ┌─────▼──────┐
│ build-sdk│        │build-prompts│
└────┬─────┘        └─────┬──────┘
     │                     │
     ├──────────┐          │
     │          │          │
┌────▼───┐ ┌───▼──────┐   │
│ xpath  │ │controller│   │
└────┬───┘ └───┬──────┘   │
     │         │           │
     └────┬────┘───────────┘
          │
   ┌──────▼───────┐
   │   release    │  ← Build extension + package + GitHub Release
   └──────────────┘
```

## Job Descriptions

### 1. `setup` — Lint & Test

Runs all quality gates. Outputs `version` for downstream jobs.

| Step | Command |
|------|---------|
| Checkout | `actions/checkout@v4 (fetch-depth: 0)` |
| Resolve version | Extract from `refs/tags/v*` or `refs/heads/release/*` |
| Enforce lowercase .md | `find + grep` |
| Install root + ext deps | `pnpm install` |
| Root lint | `pnpm run lint` |
| Extension lint | `cd chrome-extension && pnpm run lint` |
| Tests | `pnpm run test` |

### 2. `build-sdk` — Marco SDK (depends on: setup)

Uploads `standalone-scripts/marco-sdk/dist/` as `sdk-dist` artifact.

### 3a. `build-xpath` — XPath (depends on: build-sdk, parallel with 3b)

Downloads `sdk-dist`, uploads `xpath-dist`.

### 3b. `build-macro-controller` — Macro Controller (depends on: build-sdk, parallel with 3a)

Downloads `sdk-dist`, uploads `macro-controller-dist`.

### 3c. `build-prompts` — Prompts (depends on: setup, parallel with 2/3a/3b)

Uploads `prompts-dist`. No SDK dependency.

### 4. `release` — Build Extension + Verify + Package + Release

Downloads all 4 artifacts, builds the Chrome extension, verifies no source maps remain, then packages and publishes.

## Artifact Passing Between Jobs

| Artifact Name | Source Path | Consumed By |
|---------------|------------|-------------|
| `sdk-dist` | `standalone-scripts/marco-sdk/dist/` | xpath, controller, release |
| `xpath-dist` | `standalone-scripts/xpath/dist/` | release |
| `macro-controller-dist` | `standalone-scripts/macro-controller/dist/` | release |
| `prompts-dist` | `standalone-scripts/prompts/` | release |

All artifacts have 1-day retention.

## Source Map Policy

Source maps are **never shipped in release assets**. This is enforced at three levels:

1. **Build config** — `vite.config.extension.ts` sets `sourcemap: false` in production mode
2. **Verification gate** — After build, the workflow scans the output `dist/` for `.map` files and **fails the pipeline** if any are found
3. **Safety-net deletion** — Before packaging, the workflow removes any stray `.map` files from the build output

Standalone scripts (SDK, XPath, Macro Controller) also default to `sourcemap: false` in production mode via their respective Vite configs.

## Release Assets Produced

| Asset | Contents |
|-------|----------|
| `marco-extension-{VER}.zip` | Chrome extension dist (load unpacked) |
| `macro-controller-{VER}.zip` | Standalone macro controller |
| `marco-sdk-{VER}.zip` | SDK library |
| `xpath-{VER}.zip` | XPath utility |
| `prompts-{VER}.zip` | Prompt templates (if exists) |
| `install.sh` | Bash installer for Linux/macOS |
| `install.ps1` | PowerShell installer for Windows |
| `VERSION.txt` | Plain-text version identifier |
| `changelog.md` | Full project changelog |
| `checksums.txt` | SHA256 checksums of all assets |

## Checksums

SHA256 checksums are generated for all assets and included as `checksums.txt`:

```bash
cd release-assets
sha256sum * > checksums.txt
```

## Version Extraction

The version is derived from the ref type:
```
refs/tags/v2.119.0             →  v2.119.0   (tag push)
refs/heads/release/v2.119.0    →  v2.119.0   (branch push)
```

This version is used for:
- ZIP filenames
- GitHub Release tag and title
- VERSION.txt content

Version is resolved in the `setup` job and passed to `release` via job outputs.

## Release Notes Generation

Auto-generated with:
- **Release info table** — version, commit SHA (first 10 chars), branch, build date (UTC)
- **Categorized changelog** from conventional commits (`feat:`, `fix:`, `refactor:`, etc.)
- **SHA256 checksums** block
- **Assets table** with descriptions
- **Quick install** commands for PowerShell and Bash (latest + pinned)
- **Manual install** instructions for Chromium browsers

## GitHub Release Action

Uses `softprops/action-gh-release@v2`:
```yaml
tag_name: v2.119.0
name: "Marco Extension v2.119.0"
body_path: release-assets/RELEASE_NOTES.md
files: release-assets/*
draft: false
prerelease: false          # true if version contains '-' (e.g. v2.119.0-beta)
make_latest: true          # false if prerelease
```

## Prerelease Detection

Versions containing `-` (e.g. `v2.119.0-beta`, `v2.119.0-rc.1`) are automatically marked as prerelease and not set as "latest".

## Permissions

Release workflow needs `contents: write` to create tags and releases.
CI workflow only needs `contents: read`.

## Actions Versions

| Action | Version |
|--------|---------|
| `actions/checkout` | v4 |
| `actions/setup-node` | v4 |
| `pnpm/action-setup` | v4 |
| `actions/upload-artifact` | v4 |
| `actions/download-artifact` | v4 |
| `softprops/action-gh-release` | v2 |
