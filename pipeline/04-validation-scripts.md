# 04 — Validation Scripts

All validation scripts live in `scripts/` and are Node.js ESM (`.mjs`).
They exit with code 1 on failure, halting the build.

## Version Sync Check

**Script**: `scripts/check-version-sync.mjs`
**When**: Before extension build and during macro-controller build

Ensures the same `MAJOR.MINOR.PATCH` appears in ALL of these files:

| File | How version is extracted |
|------|------------------------|
| `src/shared/constants.ts` | `EXTENSION_VERSION = "X.Y.Z"` |
| `standalone-scripts/macro-controller/src/shared-state.ts` | `VERSION = 'X.Y.Z'` |
| `standalone-scripts/macro-controller/src/instruction.ts` | `version: "X.Y.Z"` |
| `standalone-scripts/macro-controller/dist/instruction.json` | `"version": "X.Y.Z"` (optional — skipped if not yet built) |

**Failure output**:
```
❌ Version mismatch detected:
   manifest.json version: 2.119.0
   constants.ts: 2.118.0
   ...
```

## Axios Version Check

**Script**: `scripts/check-axios-version.mjs`
**When**: Before every build (SDK, XPath, Controller, Extension)

Validates that the installed axios version is on the approved safe list.
Prevents accidentally shipping a version with known vulnerabilities.

## Standalone Dist Freshness

**Script**: `scripts/check-standalone-dist.mjs`
**When**: Before extension build

Verifies that each standalone script's `dist/` folder exists and contains
expected artifacts (the compiled JS bundle and instruction.json).

## Const Reassignment Lint

**Script**: `scripts/lint-const-reassign.mjs`
**When**: Before extension build

Scans for accidental `const` reassignment patterns that TypeScript
might miss in certain dynamic codepaths.

## Adding a New Validation

1. Create `scripts/check-{name}.mjs`
2. Use `process.exit(1)` on failure
3. Add it to the relevant `build:*` script chain in `package.json`
4. Log clear error messages (file path, what's wrong, expected value)
