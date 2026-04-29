# Error-Swallowing & Missing-Log Audit

> **Date:** 2026-04-27 (Asia/Kuala_Lumpur)
> **Scope:** `src/**` and `standalone-scripts/**` (TS/TSX, excluding tests, dist, `.d.ts`, and `marco-sdk-template.ts` which is a runtime-injected page script with intentional minimal surface).
> **Anchored to:**
> - `spec/03-error-manage/02-error-architecture/01-error-handling-reference.md` (3-tier, never silent)
> - `spec/02-coding-guidelines/07-csharp/03-error-handling.md` ("Never Swallow Exceptions" rule)
> - `mem://standards/error-logging-via-namespace-logger.md` (use `Logger.error()` / `logCaughtError`, no bare `log()`)
> - `mem://standards/error-logging-requirements.md` & `mem://constraints/file-path-error-logging-code-red.md` (HARD ERRORS must include exact path, missing item, reasoning)

---

## 1. Headline numbers

| Metric                                                                        |  Count |
| ----------------------------------------------------------------------------- | -----: |
| Total `catch` blocks scanned                                                  |  1,078 |
| Catches that already log via `logCaughtError` / `Logger.error` / rethrow      |    ~92 % |
| Catches that swallow with **no log AND no documented fallback**               | **17** |
| Catches that swallow with no log but a documented one-line fallback comment   | ~58 |
| Promise `.catch(() => {})` swallowers                                         | 16 |
| `console.error` callsites that should route through namespace `Logger.error`  | ~15 files |

The codebase is overwhelmingly compliant. The remaining gaps cluster in three areas: **CSP fallback DOM patches**, **injection diagnostics best-effort branches**, and **boot-time storage probes**.

---

## 2. Severity classification

We grade against the spec rules:

- **🔴 P0 — true silent swallow.** No log, no rethrow, no documented fallback. Hides a class of failures that the user/operator must see. SPEC VIOLATION.
- **🟠 P1 — silent swallow but with a documented one-liner ("/* ignore */", "fall through").** Spec-tolerated *only* when the fallback is provably benign. Needs a one-line `Logger.debug` so we can diagnose if the assumption breaks.
- **🟡 P2 — uses `console.error/warn` instead of namespace `Logger.error`.** Visible during dev but invisible in the SQLite session log + Diagnostic Dump. Memory rule violation.
- **🟢 OK — already logs via `logCaughtError`/`Logger.error` or returns a structured `{ isOk:false, errorMessage }` envelope.** No action.

---

## 3. P0 — true silent swallows (must fix)

| # | File:Line | Catch | Why it matters |
|---|-----------|-------|----------------|
| 1 | `src/background/handlers/injection-wrapper.ts:109` | `catch(__ne) { }` | Injection wrapper failure is **completely silent**. If the wrapper throws (e.g. SDK bootstrap) we lose the entire script run with zero trace. **CODE RED**: violates `file-path-error-logging-code-red`. |
| 2 | `src/background/handlers/injection-handler.ts:1236` | `catch() { /* empty */ }` | Marked "empty" — no rationale, no fallback. Swallows in injection pipeline (highest-risk subsystem). |
| 3 | `src/background/handlers/injection-handler.ts:914` | `catch() { /* best effort */ }` | Inside post-injection verification. If verify fails we silently mark scripts as healthy. |
| 4 | `src/background/handlers/injection-handler.ts:1139` | `catch() { /* best-effort warning */ }` | Same pipeline, same risk. |
| 5 | `src/background/handlers/injection-handler.ts:1546` | `catch() { /* runtime stale */ }` | Hides serviceWorker/runtime invalidation — operators need a debug breadcrumb. |
| 6 | `src/background/handlers/injection-handler.ts:1627` | `catch() { /* fall through */ }` | "Fall through" without saying *to what*. |
| 7 | `src/background/handlers/injection-handler.ts:1734` | `catch() { /* fall through */ }` | Same as above. |
| 8 | `src/background/handlers/injection-handler.ts:1912` | `catch() { /* never block the pipeline */ }` | Rationale is correct (don't block) but still needs a `Logger.debug` so the suppressed error is recoverable from logs. |
| 9 | `src/background/handlers/error-handler.ts:149` | `catch() { /* db not ready or no listeners — silently skip */ }` | This is the **error-handler itself** silencing errors. If the error DB isn't ready we lose the original error — meta-failure. |
| 10 | `src/background/handlers/dynamic-require-handler.ts:207` | `catch() { /* sw context may not have manifest */ }` | Dynamic-require failures are diagnostic gold. |
| 11 | `src/background/handlers/storage-browser-handler.ts:149` | `catch() { /* ignore */ }` | Storage browser shows users an empty/wrong table state with no warning when introspection fails. |
| 12 | `src/background/handlers/storage-browser-handler.ts:153` | `catch() { /* ignore */ }` | Same. |
| 13 | `src/background/auth-health-handler.ts:83` | `catch() { /* ignore */ }` | Auth health-check probe — silenced failures defeat the purpose of the probe. |
| 14 | `src/background/auth-health-handler.ts:133` | `catch() { /* ignore */ }` | Same. |
| 15 | `src/background/auth-health-handler.ts:141` | `catch() { /* tab access failed */ }` | Reason given but not logged. |
| 16 | `src/background/auth-health-handler.ts:268` | `catch() { /* ignore */ }` | Same. |
| 17 | `src/background/context-menu-handler.ts:131` | `catch() { /* ignore */ }` | Context-menu update failures are user-visible regressions. |

### Promise `.catch(() => {})` family (16 sites, all P0-equivalent)

`src/components/popup/PopupFooter.tsx:178`, `src/background/boot.ts:280`, `src/background/script-resolver.ts:105,108`, `src/background/handlers/project-handler.ts:205`, and **11 in `src/background/handlers/injection-handler.ts`** (lines 296, 526, 532, 536, 627, 632, 735, 811, 834, 873, 879).

The injection-handler `.catch(() => {})` cluster is particularly bad: lines **811, 834, 879** silently drop calls to `logInjectionFailure` — i.e. **we are silencing the very telemetry that records injection failures**. This is a circular-failure mode the spec explicitly forbids.

---

## 4. P1 — documented fallbacks needing a debug breadcrumb

~58 sites. They follow safe patterns ("tab may not be ready", "schema not yet applied during boot", "URL parsing of user input"). The fallback is correct but operators currently have **no way to know when these fire in the field**.

Representative examples (full list available via the audit script in section 7):

- `src/background/cookie-watcher.ts:204,243` — "Tab may not be ready / no content script"
- `src/background/cookie-helpers.ts:59,95` — "Try the next candidate URL / malformed candidate"
- `src/background/handlers/config-auth-handler.ts:525,572,588,592,603,737,802` — token discovery fallbacks
- `src/background/handlers/prompt-handler.ts:104,106,108,140,173,236` — idempotent seeding ("already exists")
- `src/background/handlers/storage-browser-handler.ts:120,133,315` — schema introspection probes
- `src/background/csp-fallback.ts:35,39,245,249,530,534` — DOM-patch fallback chain (these are tight loops; debug must be sampled, not every call)

---

## 5. P2 — `console.error` that should be namespace `Logger.error`

Files emitting `console.error` that need conversion (top offenders by call count):

| File                                                    | `console.error` calls |
| ------------------------------------------------------- | --------------------: |
| `src/background/bg-logger.ts`                           | 6 *(legitimate — last-resort logger fallback)* |
| `src/lib/developer-guide-data.generated.ts`             | 4 *(generated, ignore)* |
| `src/content-scripts/prompt-injector.ts`                | 4 |
| `src/background/session-log-writer.ts`                  | 4 *(legitimate — logger sink itself)* |
| `src/background/handlers/injection-handler.ts`          | 4 |
| `standalone-scripts/marco-sdk/src/logger.ts`            | 3 *(legitimate — logger surface)* |
| `src/hooks/use-popup-actions.ts`                        | 3 |
| `src/content-scripts/home-screen/logger.ts`             | 3 *(legitimate — logger surface)* |
| `src/components/options/monaco-js-intellisense.ts`      | 3 |
| `src/background/schema-migration.ts`                    | 3 |
| `src/background/recorder/failure-logger.ts`             | 3 *(legitimate — failure sink)* |

Conversion targets after stripping legitimate logger surfaces: **~17 callsites across 6 files**.

---

## 6. Phased remediation plan

We split into four sequenced waves so each wave is a small, reviewable PR.

### Wave 1 — STOP the bleeding (P0 silent swallows in the injection telemetry path)

**Files:** `src/background/handlers/injection-handler.ts`, `src/background/handlers/injection-wrapper.ts`, `src/background/handlers/error-handler.ts`.

Targets:
- `injection-wrapper.ts:109` — replace `catch(__ne){}` with `logCaughtError(BgLogTag.INJECTION, "injection wrapper exception", __ne)`.
- The 3 `logInjectionFailure(...).catch(()=>{})` at lines 811/834/879 — replace with `.catch((logErr) => logCaughtError(BgLogTag.INJECTION, "logInjectionFailure self-failed", logErr))`.
- The 8 `injection-handler.ts` empty-comment catches (lines 914, 1139, 1236, 1546, 1627, 1734, 1912) — convert each to `logCaughtError(BgLogTag.INJECTION, "<specific reason>", err)`. Lines explaining "best-effort/fall through" stay best-effort but emit a `Logger.debug` so the trail exists.
- `error-handler.ts:149` — meta-failure: log via the synchronous `bg-logger` last-resort sink (which is `console.error` by design — that's the legitimate fallback at the bottom of the logger stack).

**Acceptance:** `rg "catch\s*\([^)]*\)\s*\{\s*\}" src/background/handlers/` returns zero hits.

### Wave 2 — Promise `.catch(() => {})` cleanup (16 sites)

**Files:** `PopupFooter.tsx`, `boot.ts`, `script-resolver.ts`, `project-handler.ts`, `injection-handler.ts` (11 remaining).

Pattern: replace every `.catch(() => {})` with either:
```ts
.catch((err) => logCaughtError(BgLogTag.<TAG>, "<what failed>", err))
```
…or, when the caller genuinely doesn't care, the explicit form:
```ts
.catch((err) => Logger.debug(BgLogTag.<TAG>, "non-fatal:", err))
```
so we keep telemetry without changing user-visible behaviour.

### Wave 3 — Auth & context-menu P0 (5 sites)

**Files:** `auth-health-handler.ts` (4 sites), `context-menu-handler.ts` (1 site).

Auth health probe must report its own probe failures — that's literally what a health probe is for. Convert each `/* ignore */` to `logCaughtError(BgLogTag.AUTH_HEALTH, "<probe step>", err)`.

### Wave 4 — P1 debug breadcrumbs (~58 sites)

**Files:** spread across `cookie-watcher`, `cookie-helpers`, `config-auth-handler`, `prompt-handler`, `storage-browser-handler`, `csp-fallback`, `boot.ts`.

Pattern: keep the silent fallback, but add one `Logger.debug(...)` line above the comment. For tight loops (`csp-fallback`), use a once-per-load sampled emitter (introduce a tiny `logSampled(key, fn)` helper in `bg-logger.ts` if not already present) so we don't flood the SQLite log.

### Wave 5 — P2 console → namespace logger (~17 callsites)

**Files:** `prompt-injector.ts`, `injection-handler.ts` (4 stragglers), `use-popup-actions.ts`, `monaco-js-intellisense.ts`, `schema-migration.ts`.

Replace `console.error("...", err)` with `Logger.error(...)` (or `logCaughtError(...)` when inside a `catch`). Keep `console.error` only inside the three legitimate logger-sink files (`bg-logger.ts`, `session-log-writer.ts`, `failure-logger.ts`, plus the SDK and home-screen logger surfaces) where it's the bottom-of-the-stack last resort.

---

## 7. Reproducing this audit

The exact scan used:

```bash
# True swallows (no log + no obvious fallback return)
python3 .lovable/audits/scripts/scan-swallows.py

# Promise .catch(() => {}) family
rg -n '\.catch\(\s*\(\s*\)\s*=>\s*\{?\s*\}?\s*\)' src/ standalone-scripts/

# console.error usage
rg -nc 'console\.error\b' src/ standalone-scripts/
```

(The Python scanner can be vendored from this audit's history; it's ~30 lines.)

---

## 8. Estimated effort

| Wave | Sites | Effort | Risk |
|------|------:|--------|------|
| 1    | 11    | ~30 min | Low — adding logs only |
| 2    | 16    | ~30 min | Low |
| 3    | 5     | ~15 min | Low |
| 4    | 58    | ~90 min | Low — debug-level only |
| 5    | 17    | ~45 min | Low |
| **Total** | **107** | **~3.5h** | **Low** |

No behavioural change. Only diagnostic surface increases. After remediation, the **Diagnostic Dump** ZIP will surface every currently-invisible swallow path.

---

## 9. Recommendation

Start with **Wave 1** (the injection-telemetry self-silencing loop) — it's both the highest-impact and the one most likely to have masked production incidents. The other waves can land independently in any order.

Awaiting your "next" to begin Wave 1.
