# 22 — Scope of Logger.error conversion (5-file batch, 2026-04-27)

User asked to convert `console.error` → `Logger.error` in:
1. `src/content-scripts/prompt-injector.ts`
2. `src/background/handlers/injection-handler.ts`
3. `src/hooks/use-popup-actions.ts`
4. `src/components/options/monaco-js-intellisense.ts`
5. `src/background/schema-migration.ts`

## Findings & decisions

### (4) monaco-js-intellisense.ts — NO real calls
The only matches are **string literals inside Monaco snippet templates**
(`{ label: "err", insertText: "console.error(${1:value});$0" }`). These are
text the *user* types into their script editor — converting them would
break the snippet UX and ship "Logger.error" suggestions to users who
have no `Logger` symbol in their script scope. **Skipped intentionally.**

### (5) schema-migration.ts — bare console.error is intentional
Line 341 carries an explicit `// Keep bare console.error — DB may be
mid-migration` comment. The persistence-backed namespace logger writes to
the very SQLite DB that is mid-migration; routing through it during a
migration failure would either no-op silently or recurse on the same
broken schema. Lines 364/366 (rollback path) share the same constraint.
**Left as-is; matches the existing intentional escape hatch.**

### (1) prompt-injector.ts — content script (ISOLATED world)
No `RiseupAsiaMacroExt.Logger` shim exists for content-scripts/. Mirrored
the `src/content-scripts/home-screen/logger.ts` pattern with a new local
`logger.ts` scoped to `PromptInjector.*`. Three call-sites converted.

### (2) injection-handler.ts — background
`logCaughtError(BgLogTag.INJECTION, …, err)` is the project's namespace
logger equivalent here. Two SYNTAX-stage `console.error` calls converted
to `logBgWarnError` (non-fatal: failure is already routed to
`logInjectionFailure`, and the console line is purely diagnostic). The
LEGACY_SCRIPT_INJECTED `console.error` was converted to
`logCaughtError` because it represents a real error condition that is
*also* persisted via `handleLogError` immediately after.

### (3) use-popup-actions.ts — popup React
No persistent logger in popup runtime; popup has no `RiseupAsiaMacroExt`.
Added a tiny `popup-logger.ts` shim mirroring the home-screen pattern
(scope prefix `Popup.`). All three call-sites converted.

## Recommendation
Proceeded with the variant above. Reverse decisions on (4) or (5) only
on explicit user override — both have hard runtime reasons to remain bare.
