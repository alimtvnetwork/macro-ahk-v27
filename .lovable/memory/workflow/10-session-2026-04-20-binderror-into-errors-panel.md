# Session 2026-04-20 — BindError → Errors Panel (v2.168.0)

> **Goal:** Any future undefined-bind that escapes the entry-point guards (Layer 1) and is caught by the Proxy (Layer 3) must automatically land in the Errors panel — not just the message-router console — with the precise column name + SQL preview attached.

## What changed

### `src/background/bg-logger.ts`
- New enum entry `BgLogTag.SQLITE_BIND = "[sqlite-bind]"` so BindError reports get a dedicated tag, distinct from the generic `[message-router]` channel.

### `src/background/message-router.ts`
- Imported `BindError` from `./sqlite-bind-safety` and `logBgError` from `./bg-logger`.
- Extracted `messageType` once in `handleMessage` via a new `extractMessageType()` helper (defensive, returns `"(unknown)"` for malformed messages).
- `buildErrorResponse` now takes `messageType` as its second parameter.
- When the caught error `instanceof BindError`, the router calls:
  ```ts
  logBgError(
    BgLogTag.SQLITE_BIND,
    "SQLITE_BIND_ERROR",
    `Undefined bind for column "${col}" (param #${idx}) in ${msgType} — SQL: ${sqlPreview}`,
    error,
    { contextDetail: `messageType=… paramIndex=… column="…" sql="…"` },
  );
  ```
  This routes the BindError through the existing `handleLogError` pipeline → SQLite `Errors` table → `ERROR_COUNT_CHANGED` broadcast → Errors panel.
- Non-BindError throws still go through `logCaughtError(BgLogTag.MESSAGE_ROUTER, …)` exactly as before — no behavior change for normal handler failures.

## Why this matters

Before v2.168.0, a BindError surfaced only as:
- A `MESSAGE-ROUTER_ERROR` in the background console.
- An `{ isOk:false, errorMessage }` returned to the caller.

The user had no visual signal in the Errors panel that the SQLite layer rejected a bind. With three layers of defence already in place (entry-point guards, SDK defaulting, Proxy net), this hookup ensures that if any future handler refactor accidentally lets `undefined` slip through, the operator sees it immediately in the UI alongside every other error, with column + SQL preview pre-populated for triage.

## Defence-in-Depth Status (v2.168.0)

| Layer | Mechanism | Status |
|---|---|---|
| 1 | `handler-guards` at handler entry points | ✅ 10 handlers adopted |
| 2 | SDK-side defaulting (KV self-namespace `projectId`) | ✅ Unchanged |
| 3 | `wrapDatabaseWithBindSafety` Proxy → typed `BindError` | ✅ Wired at every DB boundary |
| 4 | **NEW** — Message router routes `BindError` to Errors panel via `logBgError(SQLITE_BIND_ERROR)` | ✅ v2.168.0 |

## Verification

- `npx eslint src/background/message-router.ts src/background/bg-logger.ts` → zero warnings.
- `npx tsc --noEmit -p tsconfig.json` → zero errors.
- Version unified at v2.168.0 across `manifest.json`, `constants.ts`, `macro-controller`, `marco-sdk`, and `xpath`.

## Manual verification (next AI / operator)

1. Reload extension on a matched tab.
2. From DevTools, send a malformed message that bypasses entry-point guards (e.g. directly call `db.run("INSERT INTO Foo (a) VALUES (?)", [undefined])` from a temporarily patched handler).
3. Confirm:
   - The Errors panel shows a new row with `ErrorCode = "SQLITE_BIND_ERROR"`, source `background`, category `SQLITE-BIND`, and `Context` containing `messageType=…`, `paramIndex=…`, `column=…`, `sql=…`.
   - The badge count increments; `ERROR_COUNT_CHANGED` fires.
   - The original `errorMessage` returned to the caller still reads `[SQLite BindError] param index N (column "X") is undefined. …`.

## Next Logical Step

Add vitest coverage for `assertBindable` and `wrapDatabaseWithBindSafety` so the column-name inference and Proxy interception are locked in regardless of future refactors. This is plan.md item #1.
