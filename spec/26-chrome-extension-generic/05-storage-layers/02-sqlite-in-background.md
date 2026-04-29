# SQLite in Background

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Active
**AI Confidence:** Production-Ready
**Ambiguity:** None

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Concept

The background service worker hosts a single SQLite database via
**`sqlite-wasm`** (the official Wasm port maintained by the SQLite team)
backed by **OPFS** (Origin Private File System). This is Tier 1 in the
storage tier matrix and the **default** for any persistent data.

```
┌────────────────────────────────────────┐
│ Background Service Worker              │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │  sqlite-wasm runtime (.wasm)     │  │
│  │  + JS shim (sqlite3.mjs)         │  │
│  └──────────────────────────────────┘  │
│             │                          │
│             ▼                          │
│  ┌──────────────────────────────────┐  │
│  │  OPFS file:                      │  │
│  │  /<root>/main.sqlite             │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

The SW is the **only** context that talks to SQLite. Every other context
goes through the message relay (`../04-architecture/03-message-relay.md`).

---

## Bundle vs runtime download

You have two ways to ship the WASM blob. Pick **bundle** by default.

| | Bundle (recommended) | Runtime download |
|---|---------------------|------------------|
| Where the .wasm lives | Inside the extension package (`dist/sqlite/sqlite3.wasm`) | First boot fetches it from your CDN |
| Size impact on ZIP | +~700 KB | 0 KB |
| Works offline at first install | ✅ | ❌ |
| Works on Web Store private extensions with no network | ✅ | ❌ |
| MV3 CSP impact | None — same origin | Requires `connect-src` for your CDN |
| Checksum validation | At build time | At runtime (more failure modes) |
| Verdict | **Default** | Only if you must keep the package under 5 MB |

The blueprint assumes the bundle path. The runtime path is documented
in an appendix at the bottom of this file.

---

## Lifecycle

```
SW activation
    │
    ▼
[1] Lazy-load sqlite-wasm module (dynamic import)
    │
    ▼
[2] Open OPFS handle: navigator.storage.getDirectory()
    │
    ▼
[3] Open SQLite DB on the OPFS-backed VFS
    │
    ▼
[4] Run idempotent migrations (CREATE IF NOT EXISTS …)
    │
    ▼
[5] Register handle in module-scope; expose typed query API
    │
    ▼  (SW idle ~30s)
    │
[6] SW suspended → handle GC'd → no action needed
    │
    ▼  (next message arrives)
    │
[7] SW reactivates → repeat from [1]
```

The DB **MUST** open on every SW activation. Do not assume the previous
handle is still valid. The `getDb()` accessor is async and idempotent.

---

## Reference implementation

```ts
// src/background/sqlite/db.ts
import sqlite3InitModule, { type Database, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { AppError } from "@shared/error-model";
import { createLogger } from "@shared/namespace-logger";

const log = createLogger("sqlite");
const DB_PATH = "/<RootNamespace>/main.sqlite";

let runtime: Sqlite3Static | null = null;
let db: Database | null = null;
let openPromise: Promise<Database> | null = null;

async function open(): Promise<Database> {
    if (db) return db;
    if (openPromise) return openPromise;

    openPromise = (async () => {
        try {
            runtime ??= await sqlite3InitModule({
                print: (msg) => log.info(`sqlite: ${msg}`),
                printErr: (msg) => log.warn(`sqlite-err: ${msg}`),
            });

            // OPFS-backed handle. Falls back to memory if OPFS unavailable
            // (e.g., very old Chromium) — caller must check `db.isOpfs`.
            const handle = "opfs" in runtime
                ? new runtime.oo1.OpfsDb(DB_PATH, "ct")
                : new runtime.oo1.DB(":memory:", "ct");

            (handle as Database & { isOpfs: boolean }).isOpfs = "opfs" in runtime;

            await runMigrations(handle);
            db = handle;
            return handle;
        } catch (cause) {
            throw AppError.fromFsFailure({
                code: "SQLITE_OPEN_FAILED",
                path: DB_PATH,
                missing: "Writable OPFS handle for SQLite",
                reason: "Could not open the SQLite database; check OPFS availability and quota.",
                cause,
            });
        } finally {
            openPromise = null;
        }
    })();

    return openPromise;
}

export async function getDb(): Promise<Database> {
    return await open();
}

export async function closeDb(): Promise<void> {
    db?.close();
    db = null;
}
```

The `runMigrations(handle)` function lives in
`./03-sqlite-schema-conventions.md`.

---

## OPFS specifics

OPFS gives a writable file handle scoped to the extension origin. It is
**not** what users see in their file explorer — it lives inside the
browser profile. Verify availability with:

```ts
const ok = typeof navigator !== "undefined"
    && "storage" in navigator
    && "getDirectory" in navigator.storage;
```

If `ok` is false, fall back to `:memory:` and surface a CODE-RED warning
in the diagnostic export. Never silently demote — the user must know
their data is volatile.

---

## WASM checksum validation

Bundled WASM **MUST** be checksum-validated at build time. Pattern:

```js
// scripts/compute-wasm-checksum.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const wasm = readFileSync("dist/sqlite/sqlite3.wasm");
const sha = createHash("sha256").update(wasm).digest("hex");
writeFileSync("dist/sqlite/sqlite3.wasm.sha256", sha + "\n");
```

A CI gate (`scripts/check-wasm-checksum.mjs`) re-hashes the shipped file
and fails the build if it diverges. This catches accidental rebuilds
that subtly change the bytes.

---

## Connection management rules

1. **Single handle per SW activation.** No connection pool — SQLite-wasm
   is single-threaded and the SW is the only consumer.
2. **No persistent transactions.** Each query opens, runs, commits.
   Long transactions block other handlers and will leak across SW
   suspensions.
3. **Always parameterise.** Never concatenate user input into SQL —
   use `db.exec({ sql, bind })` or prepared statements.
4. **Wrap every call in `try` and translate to `AppError`.** Bare
   sqlite errors are useless across the message relay.
5. **No `PRAGMA journal_mode=WAL`** — OPFS-VFS does not support WAL.
   Stay on the default `journal_mode=MEMORY`.

---

## Common pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Forgot to await `open()` on every call | "no such table" right after install | Always `const db = await getDb()` |
| Stored handle in module-level `let` and used after SW suspension | "database is closed" errors after ~30 s idle | Re-open via `getDb()` per call |
| Used `WAL` journal mode | Writes silently fail on OPFS | Remove the PRAGMA |
| Catch block logged a string instead of AppError | Lost path / reason in diagnostics | Throw via `AppError.fromFsFailure(...)` |
| Initialised `sqlite3InitModule` at top-level import | SW failed to register on cold install | Lazy-init inside `open()` |
| Wrote 5 MB blobs into a single row | Slow queries, OPFS bloat | Move blobs to IndexedDB or `dist/` assets |

---

## DO / DO NOT / VERIFY

**DO**

- Lazy-init `sqlite-wasm` inside `open()`, never at module top level.
- Re-open on every SW activation via `getDb()`.
- Wrap every error in `AppError.fromFsFailure({ path, missing, reason, cause })`.
- Bundle the .wasm and validate its checksum in CI.

**DO NOT**

- Use WAL journal mode on OPFS.
- Hold a transaction across `await` of an external promise.
- Read/write SQLite from any context other than the background SW.
- Catch and ignore `SQLITE_OPEN_FAILED` — surface it as fatal.

**VERIFY**

- [ ] `getDb()` is the only export from `src/background/sqlite/db.ts`.
- [ ] No `:memory:` fallback path runs without emitting a CODE-RED log.
- [ ] `dist/sqlite/sqlite3.wasm.sha256` is regenerated on every build.
- [ ] Cold install on a fresh profile boots the DB within 200 ms.

---

## Appendix — runtime download path

If you must avoid bundling the WASM:

1. Host `sqlite3.wasm` on a CDN you control with long cache headers.
2. Add the CDN to `connect-src` in the manifest CSP.
3. Persist the fetched bytes into `chrome.storage.local` under
   `BLOB_SQLITE_WASM` after first download.
4. On every SW activation, prefer the cached bytes over a refetch.
5. Validate the SHA-256 against a value in `chrome.storage.local`
   that your update flow refreshes deliberately.

This path has at least four extra failure modes. Use only when the
size budget leaves no choice.

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Storage tier matrix | `./01-storage-tier-matrix.md` |
| Schema conventions | `./03-sqlite-schema-conventions.md` |
| Self-healing & migrations | `./07-self-healing-and-migrations.md` |
| Error model | `../07-error-management/01-error-model.md` |
| CODE-RED rule | `../07-error-management/03-file-path-error-rule.md` |
| Message relay | `../04-architecture/03-message-relay.md` |
