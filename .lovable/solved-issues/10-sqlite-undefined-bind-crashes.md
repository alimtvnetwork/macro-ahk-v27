# SQLite "tried to bind a value of an unknown type (undefined)" crashes

## Description

Background message handlers using `sql.js` (`db.run`, `db.exec`, `stmt.bind`) crashed with the cryptic native error:

```
Wrong API use : tried to bind a value of an unknown type (undefined).
```

The first symptom appeared on every page load via the SDK runtime self-test calling `RiseupAsiaMacroExt.Projects.RiseupMacroSdk.kv.list()` without a `projectId`. Subsequent investigation showed every logging handler (`logging-handler`, `user-script-log-handler`, `error-handler`) and every project-data handler (`kv`, `grouped-kv`, `file-storage`, `project-api`) had latent paths where an optional payload field reached `db.run` as raw `undefined`.

## Root Cause

Three compounding factors:

1. **No input validation:** Handlers passed payload fields straight into `db.run` without checking shape. Missing fields surfaced inside sql.js, not at the entry point.
2. **No bind coercion:** Optional columns (`mimeType`, `endpointName`, `projectId` for SDK self-namespace, …) were forwarded as `undefined`. SQLite's wrapper only accepts `null`.
3. **No diagnostic surface:** When the bind did fail, the message was opaque (no column name, no param index, no SQL preview) so the actual offending field was guesswork.

## Steps to Reproduce

1. Load the extension on a matched tab.
2. Watch the Errors panel — a `MESSAGE-ROUTER_ERROR` appears within ~1s of page ready.
3. The trigger is the SDK self-test calling `kv.list()` (no `projectId`), but any handler passing an optional unknown to SQLite is vulnerable.

## Solution

Three-layer defence, landed across v2.162.0 → v2.165.0:

### Layer 1 — Entry-point validation (`handler-guards.ts`)

`src/background/handlers/handler-guards.ts` exposes:

- `requireProjectId / requireKey / requireSlug / requireField` — return `null` on missing/empty input.
- `missingFieldError(field, op)` — uniform `{ isOk:false, errorMessage }`.
- `bindOpt(value)` — coerces `undefined | null | ""` → `null`, primitives → string.
- `bindReq(value, fallback)` — same, but supplies a fallback for NOT NULL columns.
- `safeBind(params, op)` — sanitises an entire param array for dynamic queries.

Adopted by: `kv-handler`, `grouped-kv-handler`, `file-storage-handler`, `project-api-handler`, `logging-handler`, `user-script-log-handler`, `error-handler`.

### Layer 2 — SDK fix (KV namespace defaulting)

`standalone-scripts/marco-sdk/src/kv.ts` now sends a `projectId` on every message, defaulting to `"RiseupMacroSdk"` for the SDK's own self-namespace.

### Layer 3 — Global Proxy guard (`sqlite-bind-safety.ts`)

New `src/background/sqlite-bind-safety.ts`:

- `assertBindable(sql, params)` — scans for `undefined`; throws typed `BindError(paramIndex, columnName, sqlPreview)` on first hit. Column name is parsed from `INSERT (col, …) VALUES …` / `UPDATE … SET col = ?` / `WHERE col = ?` shapes.
- `wrapDatabaseWithBindSafety(db)` — `Proxy` intercepts `run`, `exec`, `prepare(...).bind/.run` while forwarding everything else.

Wired at the manager boundary so every handler picks it up automatically:

- `src/background/db-manager.ts` → `buildManager()` wraps `logsDb` and `errorsDb`.
- `src/background/project-db-manager.ts` → `getProjectDb()` wraps each per-project DB.

Cryptic "Wrong API use" errors are now precise: *"[SQLite BindError] param index 3 (column "ProjectId") is undefined. Coerce to null via bindOpt() or supply a fallback via bindReq() before binding. SQL: INSERT INTO …"*.

## Iteration Count

4 iterations across v2.162.0 → v2.165.0:

1. v2.162.0 — Hardened `kv-handler` only, fixed SDK to send `projectId`.
2. v2.163.0 — Added `bindOpt`/`bindReq` to logging handlers when symptom recurred from a different message path.
3. v2.164.0 — Created shared `handler-guards.ts`, audited and refactored all 7 SQLite-backed handlers.
4. v2.165.0 — Added `sqlite-bind-safety.ts` wrapper as a global net so any future handler that forgets the guards still produces a precise diagnostic instead of crashing sql.js.

## Learning

- **Input validation belongs at the message entry point, not deep in SQLite.** A clean `{ isOk:false, errorMessage }` is far more useful than an unhandled throw.
- **Defence in depth pays off.** Per-handler guards (Layer 1) plus a Proxy net (Layer 3) means the next "I forgot to coerce" bug surfaces with the column name pre-named.
- **The SDK self-test is a great early-warning canary** — it ran on every page load and exposed an entire class of latent bugs that hand-testing missed.
- Iterating one handler at a time was wasted effort; a centralised helper (`handler-guards.ts`) is the right shape.

## What NOT to Repeat

- Do not pass payload fields straight into `db.run` / `db.exec` / `stmt.bind`. Always go through `bindOpt()` / `bindReq()` for optional/required columns and `requireX()` for input validation.
- Do not let any handler bypass `handler-guards`. The Proxy will catch you, but the goal is "never reach the Proxy with `undefined`".
- Do not throw raw errors from a handler; return `{ isOk:false, errorMessage }`.
- Do not rely on the cryptic sql.js native message — read `BindError` (it names the column).
