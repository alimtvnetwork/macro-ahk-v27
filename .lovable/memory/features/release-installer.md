---
name: release-installer
description: Single unified installer (install.ps1/install.sh) auto-derives version from release URL, falls back to latest
type: feature
---

# Memory: features/release-installer
Updated: 2026-04-21

## Single-channel unified installer

The repo ships **one installer pair**: `scripts/install.ps1` and `scripts/install.sh`. Behavior is determined entirely at runtime by where the script was downloaded from — no build-time stamping, no separate "pinned" file.

| Source URL | Resolved version | Behavior |
|------------|------------------|----------|
| `github.com/{repo}/releases/download/vX.Y.Z/install.{ps1,sh}` | `vX.Y.Z` (parsed from URL) | URL-pinned — yellow warning printed, summary shows "(pinned via release URL)" |
| `raw.githubusercontent.com/{repo}/main/scripts/install.{ps1,sh}` | GitHub `latest` API | Auto-update — re-running upgrades to newest release |
| Local clone, no URL context | GitHub `latest` API | Same as above |

## Resolution algorithm

```
resolve_version(override):
    1. If user passed --version / -Version explicitly:
        - "latest" → query api.github.com/.../releases/latest
        - vX.Y.Z[-pre] → use as-is
        - anything else → exit 3 (format error)
    2. Parse the script's source URL ($MyInvocation.MyCommand.Path,
       $PSCommandPath, $env:MARCO_INSTALLER_URL, $BASH_SOURCE, $0).
       If matches /releases/download/(vX.Y.Z[^/]*)/, use captured group.
    3. Fall back to GitHub `latest` API.
```

There is no hard-error path for "no version determinable" — the latest API is always a viable fallback.

## Exit-code contract

| Code | Meaning |
|------|---------|
| 0 | Install succeeded |
| 3 | Invalid `--version` argument (malformed) |
| 4 | Targeted release asset missing (404 on the ZIP) |
| 5 | Network/tool error (latest API fetch failed, no curl/wget) |
| 6 | Extracted archive invalid (no files / no manifest) |

(Codes 1 and 2 are reserved for OS-detection and unexpected failures.)

## Release-pipeline contract (`release.yml`)

The "Package release assets" step only **copies** the installers verbatim — no `sed`, no sentinel substitution, no verification step. Files are dropped into `release-assets/` so `sha256sum *` and `softprops/action-gh-release` pick them up alongside the ZIPs.

## Release-notes contract

The "Quick Install" section is split into two clearly labeled subsections:

- 🔒 **Pinned to this release (recommended)** — `install.{ps1,sh}` from the release download URL. URL-pinning is implicit.
- 🌊 **Latest channel (auto-update)** — `install.{ps1,sh}` from `raw.githubusercontent.com/.../main/`.

Pinned comes **first** because users on a specific release page typically want that exact version.

## Why URL derivation (not build-time stamping)

The previous design (v0.1, since removed) shipped a separate `release-version.{ps1,sh}` with a `__PINNED_VERSION__` sentinel substituted by `sed` during release packaging. That added: a sentinel-leak verification step, a second installer pair to maintain, a parallel spec folder, and a code path that hard-errored when run from a clone. URL derivation collapses all of that into one file with no build dependency.
