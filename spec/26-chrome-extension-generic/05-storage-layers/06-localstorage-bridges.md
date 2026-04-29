# localStorage TTL Bridges

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Active
**AI Confidence:** Production-Ready
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Why a "TTL bridge" exists at all

`localStorage` is the **only synchronous, page-side** storage available
to the MAIN world. Every other tier is async or unavailable in MAIN.
That makes it the right (and only) tool for one specific job:

> Move a small, short-lived value from the extension into a
> MAIN-world page script that needs it synchronously.

The canonical example is a bearer token mirrored from the extension's
secure store so a third-party page library can read
`window.localStorage["<root>_bearer_token"]` synchronously when it
constructs an HTTP client.

Outside of this narrow case, **do not use localStorage**. Use
`chrome.storage.local` (Tier 3) or IndexedDB (Tier 2) instead.

---

## The pattern

```
┌─────────────────────────┐
│ Background SW           │
│  (token source of truth) │
└────────────┬─────────────┘
             │ chrome.scripting.executeScript
             │ world: "MAIN", func: seedFn
             ▼
┌─────────────────────────────────────┐
│ Page MAIN world                     │
│                                     │
│  localStorage.setItem(              │
│    "<root>_bearer_token",           │
│    JSON.stringify({                 │
│      v: token,                      │
│      exp: now + 600_000             │
│    })                               │
│  );                                 │
└─────────────────────────────────────┘
```

The seeded value is **always** an envelope with an explicit `exp`
(milliseconds since epoch). Readers must check `exp` and refuse to use
expired values.

---

## Envelope shape

```ts
export interface TtlBridgeEnvelope<T = string> {
    /** Schema version of the envelope. Bump when fields change. */
    readonly s: 1;
    /** Value being bridged. */
    readonly v: T;
    /** Expiry — milliseconds since epoch (UTC). */
    readonly exp: number;
    /** Optional issuer namespace, for diagnostic clarity. */
    readonly ns?: string;
}
```

A reader **MUST** treat each of these as "missing":

- key not present
- `JSON.parse` failure
- `s !== 1`
- `Date.now() >= exp`

Treating them as "missing" (rather than "throw") keeps consumers simple
and lets the SW reseed on the next cycle.

---

## Reference implementation — writer (background)

```ts
// src/background/bridges/token-bridge-seeder.ts
import { AppError } from "@shared/error-model";
import { createLogger } from "@shared/namespace-logger";

const log = createLogger("ttl-bridge.seeder");
const BRIDGE_KEY = "<root>_bearer_token";
const TTL_MS = 10 * 60 * 1000; // 10 minutes — never higher

export async function seedTokenBridge(tabId: number, token: string): Promise<void> {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: (key: string, value: string, exp: number) => {
                try {
                    window.localStorage.setItem(key, JSON.stringify({ s: 1, v: value, exp }));
                } catch {
                    // Page disabled storage; nothing else we can do from MAIN.
                }
            },
            args: [BRIDGE_KEY, token, Date.now() + TTL_MS],
        });
    } catch (cause) {
        // The recent recurring "Cannot access contents of the page" failure
        // mode lives here — see ../09-injection-and-host-access/04-...
        throw AppError.fromFsFailure({
            code: "TTL_BRIDGE_SEED_FAILED",
            path: `tab:${tabId}/localStorage[${BRIDGE_KEY}]`,
            missing: "host permission OR injectable scheme",
            reason: cause instanceof Error ? cause.message : String(cause),
            cause,
        });
    }
    log.info("token bridge seeded", { tabId, ttlMs: TTL_MS });
}
```

The TTL is **never** higher than 10 minutes for a bearer token. If a
caller wants longer, the answer is "rotate via `chrome.storage.local`
and reseed on demand", not "raise the TTL".

---

## Reference implementation — reader (MAIN world)

```ts
// standalone-scripts/sdk/src/auth/read-bridge.ts
const BRIDGE_KEY = "<root>_bearer_token";

interface Envelope { s: 1; v: string; exp: number }

export function readTokenFromBridge(): string | null {
    try {
        const raw = window.localStorage.getItem(BRIDGE_KEY);
        if (!raw) return null;
        const env = JSON.parse(raw) as Envelope;
        if (env.s !== 1 || typeof env.v !== "string" || typeof env.exp !== "number") return null;
        if (Date.now() >= env.exp) {
            window.localStorage.removeItem(BRIDGE_KEY);
            return null;
        }
        return env.v;
    } catch {
        return null;
    }
}

export function clearTokenBridge(): void {
    try { window.localStorage.removeItem(BRIDGE_KEY); } catch { /* noop */ }
}
```

Note the `try / catch` swallows. They are intentional: localStorage may
be disabled (private mode, storage cleared, quota), and any failure
should resolve to "missing".

---

## Hygiene rules

1. **Single envelope per bridge key.** Never store two unrelated values
   under the same key.
2. **Strict 10-minute ceiling for credentials.** Reseed via the message
   relay if the caller still needs it.
3. **One-shot reads where possible.** After consuming a token, call
   `clearTokenBridge()` so it cannot be replayed.
4. **No PII, no API keys, no refresh tokens.** Only short-lived access
   tokens, and only when a sync read is unavoidable.
5. **Scope the key with the namespace prefix** (`<root>_…`) so other
   extensions on the same origin cannot clash.

---

## When the SW cannot seed

The seeder is the most common failure point in the entire blueprint.
Two failure modes recur:

| Failure | Detection | Action |
|---------|-----------|--------|
| Tab URL is on a restricted scheme (`chrome://`, `chrome-extension://`, Web Store) | Pre-check via `tab.url` against the restricted-scheme list | Skip; no error — it is expected |
| `chrome.scripting.executeScript` rejects with "Cannot access contents of the page. Extension manifest must request permission to access the respective host." | Caught in try/catch around `executeScript` | Surface as `TTL_BRIDGE_SEED_FAILED` with `path: tab:<id>/localStorage[<key>]`, `missing: "host permission OR injectable scheme"`, `reason: <chrome message>`; record cooldown so we do not retry that tab for N seconds |

The cooldown registry lives in
`../09-injection-and-host-access/04-cooldown-and-blocked-tabs.md`. The
seeder MUST consult it before issuing `executeScript`.

---

## Storage events & cross-tab signalling

`localStorage` fires `storage` events in **other** tabs of the same
origin when a key changes. This is occasionally useful for "tell every
tab to invalidate its cache":

```ts
window.addEventListener("storage", (event) => {
    if (event.key !== BRIDGE_KEY) return;
    if (event.newValue === null) onTokenCleared();
});
```

Note: `storage` events do **not** fire in the tab that initiated the
write. Use a same-tab listener separately if needed.

---

## Common pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Stored raw token (no envelope) | No way to know when to reseed | Always wrap in `{ s, v, exp }` |
| TTL set to "1 day" "for convenience" | Stale token usage, hard-to-debug 401s | Cap at 10 minutes |
| Caller threw on missing/expired | Crash on first cold load | Treat missing/expired as "no token" |
| Wrote from inside the SW directly | `localStorage is not defined` | Use `chrome.scripting.executeScript({ world: "MAIN", … })` |
| Forgot to consult the cooldown registry | Repeated failed seeds, log noise | Always check before `executeScript` |
| Used a non-namespaced key | Other extension overwrites it | Always prefix with `<root>_` |
| Stored data > 100 KB | Slow writes, quota errors | Move to IndexedDB |

---

## DO / DO NOT / VERIFY

**DO**

- Use only for short-lived, sync-readable, page-side bridges.
- Always wrap values in the `{ s, v, exp }` envelope.
- Cap credential TTL at 10 minutes.
- Pre-check restricted schemes and consult the cooldown registry before seeding.
- Surface seeder failures via `AppError.fromFsFailure(...)` with full CODE-RED fields.

**DO NOT**

- Store data > 100 KB or anything you expect to persist longer than a session.
- Use it as a general key/value store.
- Read it from the background SW (it does not exist there).
- Log token values — log only the key + expiry.

**VERIFY**

- [ ] No localStorage reference exists in `src/background/`.
- [ ] Reading an expired envelope returns `null` and removes the key.
- [ ] Seeder failures recorded with `path`, `missing`, `reason`.
- [ ] Cross-origin pages cannot read the bridge (browser enforces).

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Storage tier matrix | `./01-storage-tier-matrix.md` |
| chrome.storage.local | `./05-chrome-storage-local.md` |
| Self-healing & migrations | `./07-self-healing-and-migrations.md` |
| Auth bearer token bridge | `../08-auth-and-tokens/01-bearer-token-bridge.md` |
| Token seeder pattern | `../09-injection-and-host-access/05-token-seeder.md` |
| Cooldown & blocked tabs | `../09-injection-and-host-access/04-cooldown-and-blocked-tabs.md` |
| Error model | `../07-error-management/01-error-model.md` |
