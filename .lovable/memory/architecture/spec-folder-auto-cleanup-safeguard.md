---
name: spec-folder-auto-cleanup-safeguard
description: Three-layer defense (sentinels + registry + guard script) prevents Lovable's auto-cleanup from pruning sparse spec folders
type: feature
---

# Spec Folder Auto-Cleanup Safeguard

Established 2026-04-22 after Phases 5/7/8/10 of the spec reorganization repeatedly suffered from Lovable's auto-cleanup pruning sparse or newly-created folders.

## The defense

1. **Sentinel files** — every spec/ subdirectory that lacks direct files (only sub-dirs or empty) gets a `.lovable-keep` Markdown file.
2. **Registry** — `spec/.spec-folder-registry.json` lists every required spec folder with kind/metadata.
3. **Guard script** — `scripts/spec-folder-guard.mjs` (npm: `check:spec-folders`, `check:spec-folders:repair`, `check:spec-folders:verbose`) idempotently re-creates missing folders and seeds sentinels.

## When to run

- Before starting any multi-phase spec work
- After each phase of a reorganization
- In CI / pre-commit (`check:spec-folders` exits 1 on drift)
- When a spec folder mysteriously vanishes

## Maintenance rule

When creating a new top-level spec folder, add it to `spec/.spec-folder-registry.json` and run `pnpm run check:spec-folders:repair`. When permanently removing a folder, also remove its registry entry — otherwise the guard will recreate it.

## Files

- `scripts/spec-folder-guard.mjs` — the guard
- `scripts/spec-folder-guard-readme.md` — full docs
- `spec/.spec-folder-registry.json` — registry (38 folders v1.0.0)
- `spec/**/.lovable-keep` — sentinels (9 currently)

## Why it works

The auto-cleanup heuristic (suspected) treats directories with zero direct files as garbage. Sentinels make every directory non-empty. The registry+guard add belt-and-suspenders recovery for the case where the directory is fully removed.
