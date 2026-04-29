# Lovable Owner Switch — Coding Rules Recap

These rules are NOT new — they restate existing project standards as they
apply to this script. Linked memory entries are authoritative.

---

| # | Rule | Source |
|---|---|---|
| 1 | PascalCase for tables, columns, JSON keys, JSON values | `mem://architecture/storage/database-naming-convention` |
| 2 | Enums for `TaskStatus`, `XPathKeyCode`, `LovableRole`, `UploadFileType` — never magic strings | `mem://standards/code-quality-improvement` |
| 3 | Class-based modules; ≤ 100 lines per file; entry class `LovableOwnerSwitch`, helpers injected | `mem://standards/class-based-standalone-scripts` |
| 4 | Functions ≤ 8 lines (max 12–15) | `mem://standards/formatting-and-logic` |
| 5 | Strict typing — no `any`, no `unknown` (except `CaughtError`) | `mem://standards/unknown-usage-policy` |
| 6 | No `as` casts, no `as unknown` | `mem://standards/no-type-casting` |
| 7 | Static / injected utilities scoped to namespace; nothing leaks globally | `mem://architecture/injection-context-awareness` |
| 8 | Every try/catch logs via `RiseupAsiaMacroExt.Logger.error()` with exact path, missing item, reason | `mem://standards/error-logging-via-namespace-logger.md` + `mem://constraints/file-path-error-logging-code-red.md` |
| 9 | Logs file-rotated under `logs/` for the project | `mem://architecture/session-logging-system` |
| 10 | UI / CSS / logic separated; CSS file lives next to script | `mem://standards/standalone-scripts-css-in-own-file` |
| 11 | No `!important` anywhere | `mem://standards/no-css-important` |
| 12 | Blank line before every `return` | `mem://standards/blank-line-before-return` |
| 13 | Pre-write standards check before writing any new file | `mem://standards/pre-write-check` |
| 14 | No `requestAnimationFrame` without justifying comment | `mem://standards/no-unjustified-raf` |
| 15 | Caching via root SDK only (`Cache.Add`, `Cache.Read`, `Cache.Remove`); IndexedDB namespaced per project | `mem://architecture/data-storage-layers` |
| 16 | Bearer token derived from Lovable session cookie via `getBearerToken()` — no legacy auth | `mem://auth/unified-auth-contract` |
| 17 | No retry-with-backoff loops; sequential fail-fast | `mem://constraints/no-retry-policy` |

> The pre-write standards check (rule 13) is mandatory — the agent must restate
> compliance with each applicable rule before writing the first source file.
