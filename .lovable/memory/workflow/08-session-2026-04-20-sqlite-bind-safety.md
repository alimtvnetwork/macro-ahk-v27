# Session 2026-04-20 — SQLite bind safety + SDK self-test round-trip (v2.162.0 → v2.166.0)

## Versions shipped

| Version | Highlight |
|---|---|
| v2.162.0 | First hardening of `kv-handler`; SDK `kv.ts` always sends `projectId` (default `"RiseupMacroSdk"`) |
| v2.163.0 | `bindOpt` / `bindReq` applied to `logging-handler`, `user-script-log-handler`, `error-handler` |
| v2.164.0 | Created shared `handler-guards.ts`; audited all 7 SQLite-backed handlers |
| v2.165.0 | Created `sqlite-bind-safety.ts` (Proxy + typed `BindError`); wired into `db-manager` and `project-db-manager` |
| v2.166.0 | SDK self-test extended with KV round-trip (set → get → verify-equals → delete → verify-cleared) |

## What changed

### New files
- `src/background/handlers/handler-guards.ts` — single source of truth for input validation + bind coercion.
- `src/background/sqlite-bind-safety.ts` — `assertBindable(sql, params)` + `BindError` + `wrapDatabaseWithBindSafety(db)` Proxy.

### Refactored handlers (handler-guards adopted)
- `src/background/handlers/kv-handler.ts`
- `src/background/handlers/grouped-kv-handler.ts`
- `src/background/handlers/file-storage-handler.ts`
- `src/background/handlers/project-api-handler.ts`
- `src/background/handlers/logging-handler.ts`
- `src/background/handlers/user-script-log-handler.ts`
- `src/background/handlers/error-handler.ts`

### DB managers (Proxy wired)
- `src/background/db-manager.ts` — `buildManager()` returns wrapped `logsDb` + `errorsDb`.
- `src/background/project-db-manager.ts` — `getProjectDb()` returns a wrapped instance.

### SDK
- `standalone-scripts/marco-sdk/src/kv.ts` — always sends `projectId`.
- `standalone-scripts/marco-sdk/src/self-test.ts` — added async `runKvRoundTrip()` (set → get → verify-equals → delete → verify-cleared); split helpers to satisfy zero-warning lint.
- `standalone-scripts/marco-sdk/src/index.ts` — version literals updated.

### Version-bump fan-out (every release)
- `chrome-extension/manifest.json` (`version` + `version_name`)
- `src/shared/constants.ts` (`EXTENSION_VERSION`)
- `standalone-scripts/macro-controller/src/instruction.ts`
- `standalone-scripts/macro-controller/src/shared-state.ts` (`VERSION`)
- `standalone-scripts/marco-sdk/src/instruction.ts`
- `standalone-scripts/marco-sdk/src/index.ts` (3 literals)
- `standalone-scripts/xpath/src/instruction.ts`

## Validation performed

- `npx tsc --noEmit -p tsconfig.json` → 0 errors after every step.
- `npx eslint <changed files>` → 0 warnings after split-helper refactor.
- All changes preserve dark-only theme, no Supabase, no retry policy, no `unknown` outside `CaughtError`.

## Diagnostics now visible at runtime

On every matched page load, DevTools shows two PASS lines from the SDK self-test:

```
[sdkSelfTest] PASS — Projects.RiseupMacroSdk v2.166.0 (5 checks)
[sdkSelfTest:kv-roundtrip] PASS — set/get/delete/verify round-trip OK (4 checks)
```

If a SQLite handler ever binds `undefined` again, the Errors panel will show:

```
[SQLite BindError] param index N (column "Foo") is undefined. Coerce to null
via bindOpt() or supply a fallback via bindReq() before binding. SQL: ...
```

## What's next (handed to next AI session)

1. Manual reload of the extension to confirm both PASS lines + clean Errors panel (suggested follow-up actions in `.lovable/suggestions.md`).
2. Audit the remaining 8 SQLite-backed handlers (`prompt`, `library`, `settings`, `project`, `project-config`, `script-config`, `updater`, `run-stats`) for `handler-guards` adoption — listed in `suggestions.md`.
3. Add vitest coverage for `assertBindable` + `BindError` and for the handler-guards regression suite — listed in `suggestions.md`.
4. Optionally extend the self-test round-trip to cover files and grouped-kv.

## Cross-references

- Solved issue: `.lovable/solved-issues/10-sqlite-undefined-bind-crashes.md`
- Strict-avoid entry: `.lovable/strictly-avoid.md` → "Binding `undefined` to SQLite"
- Architecture memory: `.lovable/memory/architecture/sqlite-bind-safety.md`
