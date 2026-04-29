# SQLite Bind Safety Layer

> Defence-in-depth so no handler can ever crash sql.js with `"Wrong API use : tried to bind a value of an unknown type (undefined)"` again. Introduced v2.164.0 (handler-guards) + v2.165.0 (Proxy net) + v2.168.0 (Errors panel hookup).

## Four layers

### 1. Entry-point validation — `src/background/handlers/handler-guards.ts`

| Helper | Purpose |
|---|---|
| `requireProjectId(value)` | Returns string if non-empty, else `null`. |
| `requireKey(value)` | Same shape, semantic name for KV keys. |
| `requireSlug(value)` | Same shape, semantic name for project slugs. |
| `requireField(value)` | Generic non-empty string check. |
| `missingFieldError(field, op)` | Uniform `{ isOk:false, errorMessage }`. |
| `bindOpt(value)` | Coerces `undefined / null / ""` → `null`; primitives → string. |
| `bindReq(value, fallback)` | Same as `bindOpt`, but supplies a fallback for NOT NULL columns. |
| `safeBind(params, op)` | Sanitises an entire array (used for dynamic-column INSERTs). |

Adopted by every SQLite-backed handler:
- `kv-handler`, `grouped-kv-handler`, `file-storage-handler`, `project-api-handler`
- `logging-handler`, `user-script-log-handler`, `error-handler`

### 2. SDK contract — `standalone-scripts/marco-sdk/src/kv.ts`

The SDK always sends a `projectId` (defaulting to `"RiseupMacroSdk"` for the SDK self-namespace). This eliminates the page-load-time crash that the SDK runtime self-test used to trigger.

### 3. Global Proxy net — `src/background/sqlite-bind-safety.ts`

```ts
export class BindError extends Error {
    paramIndex: number;
    columnName: string;
    sqlPreview: string;
}

export function assertBindable<T extends ReadonlyArray<unknown>>(sql: string, params: T): T;
export function wrapDatabaseWithBindSafety(db: SqlJsDatabase): SqlJsDatabase;
```

`wrapDatabaseWithBindSafety` returns a `Proxy` that intercepts `db.run`, `db.exec`, and `db.prepare(sql).bind(params) / .run(params)` — every other method passes through. When any param is `undefined`, it throws a typed `BindError` that names the **param index**, the **inferred column name** (parsed from `INSERT (col, …) VALUES …`, `UPDATE … SET col = ?`, `WHERE col = ?`), and a 120-char **SQL preview**.

Wired at the manager boundary so all current and future handlers benefit:

- `src/background/db-manager.ts` → `buildManager()` wraps `logsDb` + `errorsDb`.
- `src/background/project-db-manager.ts` → `getProjectDb(slug)` wraps the per-project DB.

Direct internal references (`flush`, `export`) keep operating on the raw instance, so persistence is unaffected.

### 4. Errors-panel hookup — `src/background/message-router.ts` (v2.168.0)

`buildErrorResponse` now special-cases `BindError`:

- Detected via `error instanceof BindError`.
- Routed through `logBgError(BgLogTag.SQLITE_BIND, "SQLITE_BIND_ERROR", …, { contextDetail })`.
- The `contextDetail` string contains `messageType=… paramIndex=… column="…" sql="…"` so the Errors panel row carries everything an operator needs to triage without opening DevTools.
- Non-BindError throws still go through the original `logCaughtError(BgLogTag.MESSAGE_ROUTER, …)` path — unchanged.

This guarantees that if any future refactor lets `undefined` slip past Layers 1–2 and trip the Proxy in Layer 3, the operator sees a visual signal in the Errors panel — not a silent console-only entry.

## Mental model

```
Handler payload
   ↓
handler-guards.requireX()  ──► missingFieldError → { isOk:false, errorMessage }
   ↓
handler-guards.bindOpt/bindReq()  (coerce optionals)
   ↓
db.run(sql, params)
   ↓
[Proxy] assertBindable(sql, params)  ──► BindError if any undefined slips through
   ↓
[message-router] buildErrorResponse  ──► logBgError(SQLITE_BIND, SQLITE_BIND_ERROR)  → Errors panel
   ↓
sql.js
```

## How to add a new SQLite handler

1. Validate every required payload field at the top: `const projectId = requireProjectId(raw.projectId); if (!projectId) return missingFieldError("projectId", "myop");`.
2. For optional columns: `bindOpt(value)`. For required NOT NULL columns where the caller may omit: `bindReq(value, "(unknown)")`.
3. Never pass raw `undefined` into a bind array.
4. If a `BindError` ever appears in the Errors panel, treat it as a P0 — the entry-point guards missed something. The `Context` column tells you exactly which messageType + column to fix.

## Cross-references

- Solved issue: `.lovable/solved-issues/10-sqlite-undefined-bind-crashes.md`
- Strictly-avoid: "Binding `undefined` to SQLite" in `.lovable/strictly-avoid.md`
- Session logs: `.lovable/memory/workflow/08-session-2026-04-20-sqlite-bind-safety.md`, `.lovable/memory/workflow/10-session-2026-04-20-binderror-into-errors-panel.md`
- Source: `src/background/handlers/handler-guards.ts`, `src/background/sqlite-bind-safety.ts`, `src/background/db-manager.ts`, `src/background/project-db-manager.ts`, `src/background/message-router.ts`, `src/background/bg-logger.ts`
