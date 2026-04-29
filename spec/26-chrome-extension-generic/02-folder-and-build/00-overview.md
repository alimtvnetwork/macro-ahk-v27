# Folder & Build

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Overview

Defines the canonical repository layout, the multi-config TypeScript matrix, per-bundle Vite configs, the MV3 manifest template with permission policy, the package.json script set, and the packaging recipe (zip → release/). Output of this folder is a buildable, lint-clean, type-clean skeleton ready for the architecture and storage layers.

---

## Files in this folder

| # | File | Description |
|---|------|-------------|
| 01 | [01-repository-layout.md](./01-repository-layout.md) | Top-level tree: src/, standalone-scripts/, scripts/, spec/, dist/, release/
| 02 | [02-tsconfig-matrix.md](./02-tsconfig-matrix.md) | tsconfig.app / tsconfig.sdk / tsconfig.node split + composite refs
| 03 | [03-vite-config.md](./03-vite-config.md) | Per-bundle vite configs (extension / sdk / standalone scripts)
| 04 | [04-manifest-mv3.md](./04-manifest-mv3.md) | manifest.json template + permission decision tree
| 05 | [05-package-json-scripts.md](./05-package-json-scripts.md) | build / build:sdk / dev / test / lint / package scripts + dep list
| 06 | [06-packaging-and-zip.md](./06-packaging-and-zip.md) | nix-zip recipe, dist/ contract, version.txt, release ZIP layout

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Parent overview | `../00-overview.md` |
| Folder structure rules | `../../01-spec-authoring-guide/01-folder-structure.md` |
