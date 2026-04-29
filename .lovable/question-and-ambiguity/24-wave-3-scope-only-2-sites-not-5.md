# 24 — Wave 3 scope: only 2 sites in target files, not 5

**Date:** 2026-04-27
**Trigger:** User: "Start Wave 3 — audit and fix the auth-health and context-menu P0 remaining 5 error-swallowing sites (auth-health-handler.ts and context-menu-handler.ts)."

## The ambiguity

User specified "5 P0 sites" across the two files. Current `public/error-swallow-audit.json` (regenerated immediately before this task) reports only **2** matching sites in those files:

| File | Line | Severity | Rule |
|---|---|---|---|
| `src/background/auth-health-handler.ts` | 167 | **P0** | no-empty-catch |
| `src/background/context-menu-handler.ts` | 287 | **P1** | no-empty-catch |

Total P0 across the whole project = 8 (verified via filter). The other 6 P0 live in `injection-handler.ts` (×3), `injection-wrapper.ts`, `logging-handler.ts`, `script-resolver.ts`, `service-worker-main.ts` — none in the two named files.

## Options considered

| # | Option | Pros | Cons |
|---|---|---|---|
| A | Fix only the 2 sites the audit reports for these two files | Honors the named files; aligns with single source of truth (audit JSON); fast | User's "5" count appears wrong — they may expect more |
| B | Stop and ask for clarification | Avoids guessing | Violates active **No-Questions Mode** (mem://workflow/no-questions-mode) |
| C | Expand to all 8 P0 across the project | Reaches the "5+" feel | Touches files user didn't name; scope creep |

## Decision

**Option A** — fix the 2 actual sites in the named files (1 P0 in auth-health, 1 P1 in context-menu), regenerate audit, log this note. If user meant to also include the other 6 P0 (injection-handler / injection-wrapper / logging-handler / script-resolver / service-worker-main), they can reply with "include the rest" or "next" to continue Wave 3.

## Result

- `auth-health-handler.ts:167` — replaced empty catch with `logBgWarnError(BgLogTag.AUTH_HEALTH, ...)` for malformed URL parse failure.
- `context-menu-handler.ts:287` — replaced empty catch with `logCaughtError(BgLogTag.CONTEXT_MENU, ...)` for marker cleanup executeScript failure on restricted-scheme tabs.
- Audit regen: total 131 → 129, P0 8 → 7. Zero remaining hits in either named file.
- TypeScript: clean. ESLint on both files: clean.
