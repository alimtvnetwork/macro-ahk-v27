# Spec Folder Auto-Cleanup Safeguard

**Created:** 2026-04-22
**Status:** ✅ Active
**Owner:** Spec governance
**Related:** `spec/99-archive/governance-history/2026-04-22-reorganization-plan.md` §Recovery notes

---

## Problem

During the v3.2.0 spec reorganization (2026-04-22), Lovable's auto-cleanup process repeatedly reverted folder moves and pruned newly created or sparse directories between phases. Symptoms observed at the start of Phases 5, 7, 8, and 10:

- Renamed folders were rolled back to old names
- Empty placeholder folders for stub specs were deleted
- Intermediate container folders (those holding only sub-folders, no direct files) disappeared
- Fresh memory-file edits were silently overwritten

The pattern strongly suggests a heuristic that treats "directories without direct files" or "directories that look unchanged" as garbage and prunes them.

---

## Three-Layer Defense

### Layer 1 — Sentinel files (`.lovable-keep`)

Every directory inside `spec/` that contains zero direct files (only subdirectories, or fully empty) gets a `.lovable-keep` sentinel file. This makes the directory non-empty to any heuristic that uses "has direct files" as a pruning criterion.

The sentinel is plain Markdown explaining what it is and why it exists, so anyone discovering it understands its purpose.

### Layer 2 — Folder registry (`spec/.spec-folder-registry.json`)

An authoritative JSON list of every required spec folder, its kind (core / app / archive / stub), and metadata. If a registered folder is *fully* deleted (sentinel and all), the guard recreates it from this list — no relying on disk state alone.

The registry is hand-curated; new folders should be added when they are created.

### Layer 3 — Guard script (`scripts/spec-folder-guard.mjs`)

Idempotent Node script that:

1. Loads the registry
2. Re-creates any registered folder that is missing
3. Drops a `.lovable-keep` sentinel into every spec/ subdirectory that lacks direct files
4. Reports drift in `--check` mode (CI-friendly, exits non-zero)

---

## Usage

### Manual invocation

```bash
# Repair drift (default mode)
pnpm run check:spec-folders:repair

# Read-only check — exits 1 if drift found
pnpm run check:spec-folders

# Verbose output (logs every directory inspected)
pnpm run check:spec-folders:verbose
```

Or directly:

```bash
node scripts/spec-folder-guard.mjs           # repair
node scripts/spec-folder-guard.mjs --check   # check only
node scripts/spec-folder-guard.mjs --verbose
```

### Recommended workflow

| When | What to run | Why |
|------|-------------|-----|
| Before starting a multi-phase spec task | `pnpm run check:spec-folders:repair` | Ensures clean baseline |
| After each phase of a reorganization | `pnpm run check:spec-folders:repair` | Catches drift introduced by the phase |
| In pre-commit / pre-build CI | `pnpm run check:spec-folders` | Fails build if drift exists |
| When a spec folder mysteriously vanishes | `pnpm run check:spec-folders:repair` | Restores it from the registry |
| After creating a new top-level spec folder | Add it to `spec/.spec-folder-registry.json`, then run repair | Registers it for future protection |

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Clean, or repairs successful |
| 1 | Drift detected in `--check` mode (no repairs made) |
| 2 | Registry missing or malformed |
| 3 | Filesystem error during repair |

---

## Output example

Clean run:
```
[guard] Repo root: /dev-server
[guard] Mode: REPAIR
[guard] Registry version: 1.0.0 — 38 required folders
[guard] ───── Summary ─────
[guard] Registered folders : 38
[guard] Folders missing    : 0
[guard] Folders recreated  : 0
[guard] Sentinels added    : 0
[guard] Total spec/ dirs   : 165
[guard] ✓ All clean — no action needed.
```

Drift detected (`--check` mode):
```
[guard] ⚠ Drift detected (2 issues):
  · MISSING DIR: spec/08-docs-viewer-ui
  · MISSING SENTINEL: spec/99-archive/wordpress/.lovable-keep
[guard] ⚠ Run without --check to repair.
```

---

## Maintaining the registry

When you create a new top-level spec folder (for example, filling a stub or adding a new spec area), update `spec/.spec-folder-registry.json`:

```jsonc
{
  "path": "spec/13-new-area",
  "kind": "core",          // core | core-stub | app | app-container | app-leaf | archive-* | governance
  "mustHaveOverview": true
}
```

Then run `pnpm run check:spec-folders:repair` to seed it.

When you remove a folder permanently, also remove its registry entry — otherwise the guard will re-create it.

### Folder kinds

| Kind | Meaning |
|------|---------|
| `core` | Numbered 01–17 universal standard |
| `core-stub` | Numbered 01–17 placeholder awaiting content |
| `app` | App-specific top-level (`21-app/`, `22-app-issues/`) |
| `app-container` | Intermediate folder inside `21-app/` (only sub-folders) |
| `app-sparse` | App folder with at most 1 direct file |
| `app-leaf` | Terminal app subfolder |
| `archive-root` | `99-archive/` itself |
| `archive-container` | Intermediate archive folder (only sub-folders) |
| `archive-leaf` | Terminal archive subfolder |
| `governance` | Cross-cutting (e.g., `validation-reports/`) |

---

## What gets a sentinel

Any spec/ subdirectory **without direct files** (only subdirectories, or fully empty). Currently 9 such directories:

- `spec/21-app/04-design-diagrams/` and its subfolder
- `spec/99-archive/duplicates/` (and one subfolder)
- `spec/99-archive/imported-error-management/` (and one subfolder)
- `spec/99-archive/imported-misc/`
- `spec/99-archive/imported-powershell-integration/`
- `spec/99-archive/wordpress/`

Once a directory gains real content (a `00-overview.md`, for example), the sentinel becomes harmless and can be left in place — the guard will not remove it (removing files is out of scope for safety).

---

## Files

| File | Purpose |
|------|---------|
| `scripts/spec-folder-guard.mjs` | The guard implementation |
| `spec/.spec-folder-registry.json` | Authoritative folder list |
| `spec/.spec-folder-registry.schema.json` | JSON Schema (optional, future) |
| `spec/**/.lovable-keep` | Sentinel files (one per at-risk dir) |
| `scripts/spec-folder-guard-readme.md` | This file |

---

*Defense established 2026-04-22 in response to repeated auto-cleanup damage during the v3.2.0 reorganization.*
