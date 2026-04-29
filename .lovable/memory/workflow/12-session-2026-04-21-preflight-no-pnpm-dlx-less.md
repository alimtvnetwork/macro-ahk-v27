---
name: Session 2026-04-21 — `check-no-pnpm-dlx-less` hardening
description: Hardened the standalone preflight guard with --json output, --scan-dir flag, per-physical-line reporting, offendingCommand field, JSON-schema README, and 15 new regression fixtures (67/67 passing) including a universal caret-integrity check.
type: workflow
---

# Session 2026-04-21 — `check-no-pnpm-dlx-less` Hardening

**Status:** ✅ Done
**Scope:** Standalone CI preflight script — no extension code, no version bump.
**Files touched:** 3 (`scripts/check-no-pnpm-dlx-less.mjs`, `scripts/check-no-pnpm-dlx-less.readme.md` (new), `readme.txt`)

## Iteration log

| # | Change | Verification |
|---|---|---|
| 1 | Launcher-token extraction prefers `pnpm`/`npx`/`pnpx` before fallback span | Manual + self-test |
| 2 | `--json` output mode added (envelope + per-hit fields) | Real-repo + synthetic JSON smoke test |
| 3 | Per-physical-line reporting (was: one hit per logical line) | New fixtures asserting `expectedHitCount` + `expectedOffendingLines` |
| 4 | `--scan-dir <path>` / `--scan-dir=<path>` flag; exit code `2` on usage errors | Manual JSON+human invocations against `/tmp` fixtures |
| 5 | `readme.txt` milestone marker updated to `let's start now 21-Apr-2026 5:52 PM` (Asia/Kuala_Lumpur) | Direct write |
| 6 | `offendingCommand` (≤1000-char full whitespace-normalised snippet) + `offendingCommandTruncated`; legacy `matchedToken` (≤120) preserved for back-compat | JSON envelope smoke test on long single-line + multi-line continuation offenders |
| 7 | 9 tricky quoting/escaping regression fixtures (nested `bash -c`, escaped `\"`, mixed quotes, prose-collision launcher, payload-spanning POSIX continuations) + `expectedOffendingColumns` runner support | Self-test 61/61 |
| 8 | `scripts/check-no-pnpm-dlx-less.readme.md` JSON-schema reference (envelopes, Hit shape, exit codes, jq snippet) | Created |
| 9 | 6 multi-line quoted / backtick fixtures + **universal caret-integrity check** on every fixture's hits via `toJsonHit` projection | Self-test 67/67 + real-repo scan clean |

## Final state

- **Self-test:** 67/67 passing
- **Real-repo scan:** clean
- **JSON envelope:** `version: 1`, two modes (`scan`, `self-test`)
- **Exit codes:** `0` clean / `1` hits / `2` usage error

## Caret-integrity check (key design note)

Initial attempt called the integrity check on raw hits; failed because `caret: {column, marker}` and `matchWindow: {text, caret}` are projections added by `toJsonHit` only. Fixed by projecting first: `const projectedHits = found.map((h) => toJsonHit(h));`. This guarantees the runner validates the **same shape** that CI tooling consumes via `--json`.

## Why no version bump

The preflight script and its README/`readme.txt` marker are not part of any version-tracked surface (manifest / `constants.ts` / standalone-script `instruction.ts` / `shared-state.ts` / SDK `index.ts`). The user-preferences rule "Code changes must bump at least minor version" applies to extension/SDK code; CI tooling under `scripts/` is excluded.

## Pickup point for next session

- All preflight work is shipped.
- No new pending issues opened.
- No suggestions added or implemented.
- The plan's "🔄 In Progress" section remains empty (last session closed v2.169.0; this session was orthogonal CI tooling).
- Next logical work item per `.lovable/plan.md`:
  > **Pending #1** — Vitest coverage for `assertBindable` + `BindError` (Proxy intercept + column-name inference).
