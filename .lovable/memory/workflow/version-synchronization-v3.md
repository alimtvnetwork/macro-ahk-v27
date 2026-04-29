---
name: Version Synchronization v3
description: Version unified across constants.ts, shared-state.ts, and all standalone script instruction files
type: workflow
---

The extension version is synchronized exactly across `src/shared/constants.ts`, `src/options/sections/AboutSection.tsx`, `standalone-scripts/macro-controller/src/instruction.ts`, `standalone-scripts/marco-sdk/src/instruction.ts`, and `standalone-scripts/xpath/src/instruction.ts`. Version consistency is validated via `scripts/check-version-sync.mjs`. The single source of truth for reading the current version is `src/shared/constants.ts` (EXTENSION_VERSION). The `scripts/bump-version.mjs` script updates all files in one shot.
