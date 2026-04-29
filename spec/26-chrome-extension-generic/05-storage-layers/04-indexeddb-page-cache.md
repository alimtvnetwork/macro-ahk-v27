# IndexedDB Page Cache

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Active
**AI Confidence:** Production-Ready
**Ambiguity:** None

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## When to use IndexedDB (and when not)

IndexedDB is the right tier when **all** of these are true:

1. The data is read by the **page** (content script or MAIN-world SDK),
   not the background SW.
2. The records are large or numerous (> 100 KB total).
3. The data is scoped to a single web origin.
4. You can re-fetch / re-derive it if the user clears site data.

If any one of these is false, jump to the matrix:

| If… | Use instead |
|-----|-------------|
| The SW also needs to read it | Tier 1 SQLite |
| It's < 100 KB and ≤ 10 min lived | Tier 4 localStorage TTL bridge |
| It's an extension-wide config | Tier 3 chrome.storage.local |
| It must survive "Clear site data" | Tier 1 SQLite (with reseed) |

---

## Why a "dual cache" pattern

Many real-world caches store the **same logical record in two shapes**:

- A canonical **JSON** copy for code (sort, filter, search).
- A pre-rendered **HTML** (or pre-parsed) copy for fast UI mounting.

Storing both avoids re-rendering on every page nav. The blueprint
formalises this as the **dual-cache** pattern:

```
┌──────────────────────────────────────────────┐
│ IndexedDB database: <root>_cache             │
│                                              │
│  Object store: items_json                    │
│    key: itemId (string)                      │
│    value: { itemId, version, payload, savedAt }
│                                              │
│  Object store: items_html                    │
│    key: itemId (string)                      │
│    value: { itemId, version, html, savedAt } │
└──────────────────────────────────────────────┘
```

Two stores, one transaction per write. Reads are independent — UI mount
hits `items_html` first; "save" / "search" workflows hit `items_json`.

---

## Database & store conventions

| Element | Convention | Example |
|---------|------------|---------|
| Database name | `<root>_<purpose>` (lowercase, snake) | `myext_prompt_cache` |
| Database version | Integer, monotonically increasing | 1, 2, 3, … |
| Object-store name | snake_case, plural | `items_json`, `items_html` |
| Key path | Always explicit; never auto-increment | `keyPath: "itemId"` |
| Index name | `by_<col>` | `by_savedAt` |
| Record envelope | Always `{ id, version, payload, savedAt }` | See below |

Every record carries a **version** field set to the schema version that
wrote it. Readers compare against the current version and discard
mismatches — see "Version mismatch handling" below.

---

## Reference implementation

```ts
// standalone-scripts/sdk/src/cache/dual-cache.ts
import { AppError } from "@sdk/error-model";
import { createLogger } from "@sdk/namespace-logger";

const log = createLogger("idb.dual-cache");

const DB_NAME = "<root>_prompt_cache";
const DB_VERSION = 1;
const STORE_JSON = "items_json";
const STORE_HTML = "items_html";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (event) => {
            const db = req.result;
            const oldVersion = event.oldVersion;

            // Additive migration: create stores if missing.
            if (!db.objectStoreNames.contains(STORE_JSON)) {
                const s = db.createObjectStore(STORE_JSON, { keyPath: "itemId" });
                s.createIndex("by_savedAt", "savedAt");
            }
            if (!db.objectStoreNames.contains(STORE_HTML)) {
                db.createObjectStore(STORE_HTML, { keyPath: "itemId" });
            }
            log.info("idb upgrade", { oldVersion, newVersion: DB_VERSION });
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(AppError.fromFsFailure({
            code: "IDB_OPEN_FAILED",
            path: `indexeddb://${DB_NAME}`,
            missing: "Writable IndexedDB handle",
            reason: req.error?.message ?? "unknown indexedDB.open failure",
            cause: req.error,
        }));
        req.onblocked = () => log.warn("idb open blocked — another tab holds an old version");
    });
    return dbPromise;
}

interface Envelope<T> { itemId: string; version: number; payload: T; savedAt: string }
interface HtmlEnvelope { itemId: string; version: number; html: string; savedAt: string }

export async function putItem<T>(itemId: string, payload: T, html: string): Promise<void> {
    const db = await open();
    const savedAt = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORE_JSON, STORE_HTML], "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(AppError.fromFsFailure({
            code: "IDB_PUT_FAILED",
            path: `indexeddb://${DB_NAME}/${itemId}`,
            missing: "Successful readwrite transaction commit",
            reason: tx.error?.message ?? "unknown transaction error",
        }));
        tx.objectStore(STORE_JSON).put({ itemId, version: DB_VERSION, payload, savedAt } satisfies Envelope<T>);
        tx.objectStore(STORE_HTML).put({ itemId, version: DB_VERSION, html, savedAt } satisfies HtmlEnvelope);
    });
}

export async function getJson<T>(itemId: string): Promise<T | null> {
    const db = await open();
    return await new Promise<T | null>((resolve, reject) => {
        const req = db.transaction(STORE_JSON, "readonly").objectStore(STORE_JSON).get(itemId);
        req.onsuccess = () => {
            const env = req.result as Envelope<T> | undefined;
            if (!env) return resolve(null);
            if (env.version !== DB_VERSION) {
                log.warn("idb version mismatch — discarding", { itemId, found: env.version, expected: DB_VERSION });
                return resolve(null);
            }
            resolve(env.payload);
        };
        req.onerror = () => reject(AppError.fromFsFailure({
            code: "IDB_GET_FAILED",
            path: `indexeddb://${DB_NAME}/${itemId}`,
            missing: "Readable JSON record",
            reason: req.error?.message ?? "unknown read error",
        }));
    });
}

// getHtml(itemId) is symmetric to getJson — omitted for brevity.
```

---

## Transaction rules

1. **One transaction per write set.** Bundle the JSON + HTML write into
   a single `readwrite` transaction so they cannot drift.
2. **Never `await` a non-IDB promise inside a transaction.** IDB
   auto-commits on the first turn of the event loop where it has no
   pending requests — awaiting `fetch(...)` mid-transaction silently
   commits, then your next `put` throws "transaction is finished".
3. **Always set `oncomplete` / `onerror`.** Resolving on the request's
   `onsuccess` is wrong — the transaction can still abort.
4. **One DB open per page.** Cache the promise in module scope.

---

## Version mismatch handling

When `DB_VERSION` bumps, two things happen:

- `onupgradeneeded` runs and additively creates new stores / indexes.
- All previously written records still carry their **old** `version`
  field. Readers detect the mismatch and treat the record as missing.

Treating mismatched records as **missing** (not "throw") keeps reseed
paths trivial: the next call that needs the data will repopulate the
cache from the source of truth.

Document the schema version bump in `98-changelog.md` of the consuming
project.

---

## Quota & eviction

| Concern | Behaviour | Mitigation |
|---------|-----------|------------|
| Quota | Shared with OPFS — same group quota | Periodically call `navigator.storage.estimate()` |
| Eviction | Best-effort; "best-effort" persistence may evict on disk pressure | Call `navigator.storage.persist()` once after first successful write |
| User wipe | "Clear site data" deletes every store on the origin | Pair with a reseed source (Tier 1 SQLite or network fetch) |
| Private mode | Empty separate DB | Detect via `(await navigator.storage.estimate()).quota < 120 * 1024 * 1024` heuristic |

Periodic budget check (run on SDK init):

```ts
const est = await navigator.storage.estimate();
const used = est.usage ?? 0;
const quota = est.quota ?? 0;
if (quota > 0 && used / quota > 0.5) {
    log.warn("idb usage > 50% of quota", { used, quota });
}
```

---

## Common pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| `await fetch()` inside a transaction | "transaction is finished" on next `put` | Buffer outside, then open a fresh transaction |
| Resolved on `req.onsuccess` instead of `tx.oncomplete` | Records appear missing on reload | Resolve on `tx.oncomplete` |
| Auto-incrementing keys | Collision on reseed | Use explicit `keyPath: "itemId"` |
| Bumped `DB_VERSION` without `onupgradeneeded` | "store not found" after upgrade | Always handle upgrade in the open() wrapper |
| Missing `onblocked` listener | Silent hang when an old tab holds the DB | Always set `onblocked` (log + show user message) |
| Stored DOM nodes / functions | `DataCloneError` | Serialise to JSON or string first |

---

## DO / DO NOT / VERIFY

**DO**

- Cache the open promise in module scope.
- Wrap JSON + HTML writes in a single `readwrite` transaction.
- Resolve on `tx.oncomplete`, not `req.onsuccess`.
- Stamp every record with the current `DB_VERSION`.
- Call `navigator.storage.persist()` once after first successful write.

**DO NOT**

- Await non-IDB promises mid-transaction.
- Use auto-increment keys.
- Read IndexedDB from the background SW (it does not exist there).
- Store binary blobs > 50 MB per record (browser-imposed soft limit).

**VERIFY**

- [ ] Two consecutive `putItem` calls produce exactly two records in
      each store, not one.
- [ ] Bumping `DB_VERSION` discards old-version records on read.
- [ ] DevTools → Application → IndexedDB shows the database under the
      target origin (not under the extension origin).
- [ ] Quota usage logged once per session.

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Storage tier matrix | `./01-storage-tier-matrix.md` |
| Self-healing & migrations | `./07-self-healing-and-migrations.md` |
| Error model | `../07-error-management/01-error-model.md` |
| Three-world model | `../04-architecture/02-three-world-model.md` |
