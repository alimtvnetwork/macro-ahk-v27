# Storage Layers

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Overview

Defines the four-tier storage architecture: SQLite (background, unlimited, persistent), IndexedDB (page, per-origin), chrome.storage.local (extension, ~10 MB), localStorage (page, TTL bridges). Includes schema conventions, the dual-cache IndexedDB pattern, and the self-healing builtin-script-guard.

---

## Files in this folder

| # | File | Description |
|---|------|-------------|
| 01 | [01-storage-tier-matrix.md](./01-storage-tier-matrix.md) | 4-tier comparison: scope, capacity, persistence, latency
| 02 | [02-sqlite-in-background.md](./02-sqlite-in-background.md) | sqlite-wasm in service worker, OPFS, bundle vs runtime
| 03 | [03-sqlite-schema-conventions.md](./03-sqlite-schema-conventions.md) | PascalCase tables, JsonSchemaDef, additive migrations
| 04 | [04-indexeddb-page-cache.md](./04-indexeddb-page-cache.md) | When to use IDB; dual JsonCopy / HtmlCopy pattern
| 05 | [05-chrome-storage-local.md](./05-chrome-storage-local.md) | Manifest, builtin scripts, bootstrap config
| 06 | [06-localstorage-bridges.md](./06-localstorage-bridges.md) | TTL bridges for MAIN-world tokens (with risks)
| 07 | [07-self-healing-and-migrations.md](./07-self-healing-and-migrations.md) | Two-stage builtin-script-guard, hash-based reseed

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Parent overview | `../00-overview.md` |
| Folder structure rules | `../../01-spec-authoring-guide/01-folder-structure.md` |
