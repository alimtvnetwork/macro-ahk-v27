---
name: Standalone wiring preflight
description: scripts/preflight-standalone-wiring.mjs runs before CI builds, prints exact files+snippets for any missing wiring, fail-fast exit 1
type: feature
---
# Standalone wiring preflight

`scripts/preflight-standalone-wiring.mjs` (npm: `pnpm run preflight:standalone`) is the **first** diagnostic gate in CI for the standalone-scripts registry.

## Behaviour
- Wraps `scripts/report-standalone-registry.mjs --json` (single source of truth — never re-templates fixes).
- Sequential, fail-fast: one pass, no retry/backoff (per no-retry policy).
- Per-gap output prints: `location`, `file`, `at` (insertion point), `action` (reason from upstream), and a copy-pasteable `snippet` when available.
- Emits `::error file=…,title=…::` GitHub annotations when `GITHUB_ACTIONS=true` so gaps surface inline on PR diffs.
- Exit codes: `0` = all wired · `1` = at least one gap · `2` = internal error invoking the report.

## CI placement
Job `report-standalone-registry` in `.github/workflows/ci.yml` runs the preflight step first, then `report-standalone-registry.mjs --strict` with `if: always()` as a defence-in-depth re-check. Both must pass before any heavy build job starts.

## When to extend
If `report-standalone-registry.mjs` adds a new wiring location, NO change is needed here — the preflight passes through whatever `gap.fix.{file,at,snippet}` the report emits. Only update `normaliseGap()` if the upstream gap-object schema itself changes.
