# Solved Issue: Version Bump v2.4.0 → v2.5.0

**Resolved**: 2026-04-05
**Version**: v2.5.0

## Changes

Version bumped across all sync points:

| File | Field | Old | New |
|------|-------|-----|-----|
| `src/shared/constants.ts` | EXTENSION_VERSION | 2.4.0 | 2.5.0 |
| `chrome-extension/manifest.json` | version | 2.4.0 | 2.5.0 |
| `chrome-extension/manifest.json` | version_name | 2.4.0 | 2.5.0 |
| `src/options/sections/AboutSection.tsx` | version const | 2.3.0 | 2.5.0 |
| `standalone-scripts/macro-controller/src/instruction.ts` | version | 2.4.0 | 2.5.0 |
| `standalone-scripts/marco-sdk/src/instruction.ts` | version | 1.3.0 | 2.5.0 |

## Note

`AboutSection.tsx` was still at 2.3.0 (missed in previous bump) — corrected to 2.5.0.
SDK instruction version was independent (1.3.0) — unified to match extension version.

## Trigger

Build error fix (compile-instruction.mjs preamble regex) + session work warranted a minor version bump per engineering rules.
