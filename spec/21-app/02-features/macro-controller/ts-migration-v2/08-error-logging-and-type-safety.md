# Error Logging & Type Safety Improvement Spec

**Version:** 1.0.0  
**Status:** READY  
**Created:** 2026-04-09  
**Scope:** `standalone-scripts/macro-controller/src/` + `standalone-scripts/marco-sdk/src/`

---

## 1. Problem Statement

The macro-controller codebase has three recurring code quality issues:

1. **Swallowed errors** — `catch` blocks that silently discard errors with `/* ignore */`, `/* silent */`, or empty bodies
2. **`any` types** — 66 occurrences across 7 files; defeats TypeScript's safety guarantees
3. **Inconsistent error logging** — some errors use `log(msg, 'error')` while others use `console.warn` or nothing; no structured error logger

---

## 2. Goals

| # | Goal | Acceptance |
|---|------|------------|
| G1 | Zero `any` types in macro-controller `src/` (excluding `__tests__/`) | `grep -r ': any\|as any' src/ --include='*.ts'` returns 0 non-test matches |
| G2 | Zero swallowed errors — every `catch` block logs before returning/re-throwing | Manual audit of all catch blocks confirms logging |
| G3 | Structured error logging via SDK namespace logger | All error logs use `RiseupAsiaMacroExt`-rooted logger, not bare `log()` calls |
| G4 | `RiseupAsiaMacroExt` namespace fully typed in `globals.d.ts` | No `ts(2304)` errors on `RiseupAsiaMacroExt` references |

---

## 3. Design

### 3.1 Namespace Logger (SDK-side)

Add a `Logger` static class to the SDK, exposed on `RiseupAsiaMacroExt.Logger`:

```typescript
// marco-sdk/src/logger.ts
export class NamespaceLogger {
  static error(fn: string, msg: string, error?: unknown): void;
  static warn(fn: string, msg: string): void;
  static info(fn: string, msg: string): void;
  static debug(fn: string, msg: string): void;
}
```

Each method:
- Prefixes with `[RiseupAsia]` + function name
- For `error()`: includes stack trace from the error object if available
- Writes to `console.error` / `console.warn` / `console.info` / `console.debug`
- Never swallows — always outputs

Controller accesses via `RiseupAsiaMacroExt.Logger.error(fn, msg, err)` at runtime.

### 3.2 `globals.d.ts` — Full Namespace Typing

Replace the current `RiseupAsiaMacroExt` type with comprehensive interface:

```typescript
interface RiseupAsiaMacroExtNamespace {
  Logger?: {
    error(fn: string, msg: string, error?: unknown): void;
    warn(fn: string, msg: string): void;
    info(fn: string, msg: string): void;
    debug(fn: string, msg: string): void;
  };
  Projects?: Record<string, RiseupAsiaProject | undefined>;
}

interface RiseupAsiaProject {
  meta?: { version?: string };
  api?: Record<string, unknown>;
  _internal?: Record<string, unknown>;
  cookies?: {
    bindings?: Array<RiseupAsiaCookieBinding>;
  };
}

interface RiseupAsiaCookieBinding {
  role?: string;
  cookieName?: string;
}
```

### 3.3 Error Logging Rules

| Rule | Description |
|------|-------------|
| R1 | Every `catch` block MUST log the error with context (function name + what failed) |
| R2 | Use `RiseupAsiaMacroExt.Logger.error()` for unexpected errors |
| R3 | Use `RiseupAsiaMacroExt.Logger.warn()` for recoverable fallbacks (e.g., localStorage unavailable) |
| R4 | Use `RiseupAsiaMacroExt.Logger.debug()` for intentional fallbacks (e.g., JSON parse → raw token) |
| R5 | NEVER use `/* ignore */`, `/* silent */`, or empty catch bodies |

### 3.4 `any` Elimination Strategy

| File | `any` Count | Fix Strategy |
|------|-------------|--------------|
| `auth-resolve.ts` | 1 | Replace `ns: any` with `RiseupAsiaProject` interface |
| `settings-ui.ts` | 7 | Define `SettingsTabResult` interfaces for each tab's return shape |
| `bulk-rename.ts` | 2 | Define `RenameFieldRow` interface for `tmplRow`/`prefixRow`/`suffixRow` |
| `startup-idempotent-check.ts` | 1 | Type `existingController` as `MacroControllerFacade` |
| `MacroController.ts` | 1 | Use proper cast `as MacroControllerFacade` instead of `as any` |

---

## 4. Swallowed Error Inventory

### 4.1 Silent Catches (`/* ignore */`, `/* silent */`, empty body)

| # | File | Line(s) | Current | Fix |
|---|------|---------|---------|-----|
| S1 | `workspace-cache.ts` | ~29 | `catch (_e) { /* ignore */ }` — URL parse | Log warn: URL parse failed |
| S2 | `workspace-cache.ts` | ~93 | `catch (_e) { /* ignore */ }` — localStorage write | Log warn: localStorage write failed |
| S3 | `workspace-cache.ts` | ~116 | `catch (_e) { /* ignore */ }` — localStorage read | Log warn: localStorage read failed |
| S4 | `prompt-loader.ts` | ~117 | `.catch(function() { /* silent */ })` — cache invalidation | Log debug: cache invalidation failed |
| S5 | `prompt-loader.ts` | ~138 | `.catch(function() { /* silent */ })` — cache invalidation | Log debug: cache invalidation failed |
| S6 | `prompt-cache.ts` | ~130 | `.catch(function() { return null; })` — IndexedDB read | Log warn: IndexedDB read failed |
| S7 | `prompt-cache.ts` | ~165 | `.catch(function() { /* silent */ })` — IndexedDB write | Log warn: IndexedDB write failed |
| S8 | `shared-state.ts` | ~90 | `catch (_e) { /* SDK namespace not yet registered */ }` | Log debug with message |
| S9 | `panel-layout.ts` | ~27 | `catch (_e) { return 'expanded'; }` — localStorage read | Log debug: panel state read failed |
| S10 | `panel-layout.ts` | ~54 | `catch (_e) { return null; }` — JSON parse | Log debug: geometry parse failed |
| S11 | `save-prompt.ts` | ~100 | `catch (_e) { /* XPath eval error */ }` | Log warn: XPath eval failed |
| S12 | `save-prompt.ts` | ~129 | `catch (_e) { /* selector error */ }` | Log warn: CSS selector failed |
| S13 | `xpath-utils.ts` | ~181 | `catch (_e) { /* skip */ }` | Log debug: XPath evaluation skipped |
| S14 | `section-collapsible.ts` | ~80 | `catch (_e) { /* ignore */ }` — localStorage read | Log debug: collapsed state read failed |
| S15 | `section-collapsible.ts` | ~86 | `catch (_e) { /* ignore */ }` — localStorage write | Log debug: collapsed state write failed |
| S16 | `tools-sections-builder.ts` | ~269 | `.catch(function() { /* fallback */ })` — clipboard write | Log warn: clipboard write failed |

### 4.2 Already-Logged Catches (No Changes Needed)

These catch blocks already log properly:
- `task-next-ui.ts` lines 65, 146, 173 — all log with context
- `prompt-utils.ts` line 69 — logs with `logSub`
- `panel-layout.ts` lines 23, 46, 294, 396 — all log with `logSub`
- `hot-reload-section.ts` lines 60, 82, 114 — all log with `logSub`

---

## 5. Implementation Tasks

| Task | Description | Files |
|------|-------------|-------|
| T1 | Create `NamespaceLogger` class in SDK | `marco-sdk/src/logger.ts`, `marco-sdk/src/index.ts` |
| T2 | Update `globals.d.ts` with full namespace + logger types | `macro-controller/src/globals.d.ts` |
| T3 | Fix all 16 swallowed errors (S1–S16) | 8 files per inventory above |
| T4 | Eliminate all `any` types (5 files) | Per §3.4 strategy |
| T5 | Migrate controller `log(msg, 'error')` calls to `Logger.error()` | All files using error-level logs |
| T6 | Verify: `tsc --noEmit` passes, ESLint zero errors | Build check |

---

## 6. Out of Scope

- SDK files (`marco-sdk/src/`) — already use `console.*` directly (SDK IS the logger)
- Test files (`__tests__/`) — `any` casts acceptable in test fixtures
- `log()` calls at info/success/warn level — existing pattern stays for now; only `error` level migrates

---

## 7. Version Impact

- Macro Controller: minor bump (code quality, no behavior change)
- Marco SDK: minor bump (new `NamespaceLogger` class)
- Extension: version bump required per policy

---

*Spec complete — implement task-by-task on user command.*
