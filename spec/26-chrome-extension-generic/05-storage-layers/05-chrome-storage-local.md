# chrome.storage.local

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Active
**AI Confidence:** Production-Ready
**Ambiguity:** None

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## When to use chrome.storage.local

This is Tier 3. Reach for it when **all** of these hold:

1. The data is **extension-wide** (not per-origin).
2. Both the background SW **and** UI contexts need to read it.
3. It is **small** (< 1 MB without `unlimitedStorage`).
4. It must survive SW suspension and browser restart.
5. It is **not** secret (no JWTs, no API keys long-term).

Typical residents: the **builtin script manifest**, **bootstrap config**,
**feature flags**, **install metadata**, **last-known good versions**.

If your data needs SQL → Tier 1. If it is page-side → Tier 2. If it is
secret with TTL → Tier 4 (and only with explicit expiry tracking).

---

## Key naming convention

A single flat namespace for the whole extension. Use the prefix system
to avoid collisions and to make `getBytesInUse()` reports readable.

| Prefix | Purpose | Examples |
|--------|---------|----------|
| `BOOT_` | Read on every SW activation | `BOOT_INSTALLED_AT`, `BOOT_LAST_VERSION` |
| `MAN_` | Manifests + registries | `MAN_BUILTIN_SCRIPTS`, `MAN_NAMESPACES` |
| `CFG_` | Configuration | `CFG_FEATURE_FLAGS`, `CFG_RETRY_COOLDOWN_MS` |
| `KV_` | Generic key/value | `KV_ONBOARDING_DISMISSED` |
| `BLOB_` | Cached binary (base64 string) | `BLOB_SQLITE_WASM` |
| `STATE_` | Last-known background state | `STATE_OPEN_TABS_DIGEST` |

All keys are `SCREAMING_SNAKE_CASE`. The lint rule rejects any
`chrome.storage.local.set/get` call whose key does not start with one of
the above prefixes.

---

## Reference implementation

Wrap chrome.storage.local in a typed adapter — never call it directly
from feature code.

```ts
// src/shared/storage/chrome-local.ts
import { AppError } from "@shared/error-model";

const ALLOWED_PREFIXES = ["BOOT_", "MAN_", "CFG_", "KV_", "BLOB_", "STATE_"] as const;

function assertPrefix(key: string): void {
    if (!ALLOWED_PREFIXES.some((p) => key.startsWith(p))) {
        throw new AppError({
            code: "CHROME_STORAGE_BAD_KEY",
            reason: `Key "${key}" must start with one of ${ALLOWED_PREFIXES.join(", ")}`,
        });
    }
}

export const chromeLocal = {
    async get<T>(key: string): Promise<T | undefined> {
        assertPrefix(key);
        const result = await chrome.storage.local.get(key);
        return result[key] as T | undefined;
    },

    async set(key: string, value: unknown): Promise<void> {
        assertPrefix(key);
        const size = byteSize(value);
        if (size > 900 * 1024) {
            // chrome.storage.local soft cap is 10 MB total without
            // unlimitedStorage; warn loudly above 900 KB per key.
            throw AppError.fromFsFailure({
                code: "CHROME_STORAGE_OVERSIZE",
                path: `chrome.storage.local/${key}`,
                missing: "Value < 900 KB (or unlimitedStorage permission + explicit allowlist)",
                reason: `Value size ${size} bytes exceeds 900 KB; promote to IndexedDB or SQLite.`,
            });
        }
        await chrome.storage.local.set({ [key]: value });
    },

    async remove(key: string): Promise<void> {
        assertPrefix(key);
        await chrome.storage.local.remove(key);
    },

    async getBytesInUse(): Promise<number> {
        return await chrome.storage.local.getBytesInUse(null);
    },

    onChanged(handler: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => void): () => void {
        const listener = (changes: chrome.storage.StorageChange, area: string) => {
            if (area === "local") handler(changes as never);
        };
        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    },
};

function byteSize(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
```

---

## What MUST live here

| Surface | Key | Why |
|---------|-----|-----|
| Builtin script manifest (id → blob hash + version + asset path) | `MAN_BUILTIN_SCRIPTS` | Read by SW on every activation; needed before SQLite is open |
| Namespace registry | `MAN_NAMESPACES` | Same — read before message router mounts |
| Bootstrap config | `BOOT_CONFIG` | Feature flags, default URLs, default project |
| Install metadata | `BOOT_INSTALLED_AT`, `BOOT_LAST_VERSION` | First-run detection, upgrade migrations |
| Cached WASM (only on the runtime-download path) | `BLOB_SQLITE_WASM` + `BLOB_SQLITE_WASM_SHA256` | See `02-sqlite-in-background.md` appendix |

What MUST NOT live here:

- Bearer tokens long-term (use Tier 4 TTL bridge).
- User-generated content (use Tier 1 SQLite).
- Per-origin caches (use Tier 2 IndexedDB).
- Anything > 1 MB without `unlimitedStorage` and an allowlist exception.

---

## Quota strategy

```ts
async function quotaReport(): Promise<{ usedBytes: number; pct: number }> {
    const used = await chromeLocal.getBytesInUse();
    const cap = 10 * 1024 * 1024; // 10 MB default cap
    return { usedBytes: used, pct: used / cap };
}
```

- Log a warning above 50 % usage.
- Promote the largest key to a different tier above 75 %.
- Never assume `unlimitedStorage` succeeded — it is an **optional**
  permission and the user can revoke it.

---

## Change events & cross-context sync

`chrome.storage.onChanged` fires in **every extension context** that has
the storage key in scope (background SW, options page, popup, content
scripts that imported the adapter). This is the canonical channel for
"setting changed in Options page → background re-reads it".

```ts
chromeLocal.onChanged((changes) => {
    if ("CFG_FEATURE_FLAGS" in changes) {
        log.info("feature flags updated", { ...changes.CFG_FEATURE_FLAGS });
        applyFlags(changes.CFG_FEATURE_FLAGS.newValue as FlagSet);
    }
});
```

This makes a separate "broadcast" message redundant for any event that
is already a storage write.

---

## `unlimitedStorage` policy

- List `unlimitedStorage` under `optional_permissions` in the manifest.
- Request it **only** when a feature provably needs > 1 MB total.
- After granting, write a sentinel `BOOT_UNLIMITED_GRANTED = true` so
  later code can branch.
- Treat the absence of the permission as the default — the build must
  work without it.

---

## Common pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Stored a 5 MB blob → quota exceeded | Subsequent writes throw silently in some Chrome versions | Promote to IndexedDB / OPFS |
| Wrote on every keystroke in Options UI | UI lag, quota churn | Debounce 250 ms before persisting |
| Read in MAIN-world script directly | `chrome` undefined | Bridge via content script (or just don't — it is extension-wide, not page state) |
| Stored a JWT for "convenience" | Token leaks in `chrome.storage.local` survives uninstall logout flows | Use Tier 4 TTL bridge or memory-only |
| Skipped the prefix → name collision | One feature overwrites another | Adopt the prefix lint rule |
| Forgot to handle `chrome.runtime.lastError` in legacy callbacks | Silent failure | Use Promise API only (`chrome.storage.local.set({...})` returns a Promise in MV3) |

---

## DO / DO NOT / VERIFY

**DO**

- Wrap every call in the typed adapter above.
- Use the prefix system (`BOOT_`, `MAN_`, `CFG_`, `KV_`, `BLOB_`, `STATE_`).
- Subscribe to `onChanged` for cross-context sync.
- Log `getBytesInUse()` in the diagnostic ZIP export.

**DO NOT**

- Store secrets long-term.
- Write per-keystroke.
- Bypass the adapter — direct `chrome.storage.local.set` is a lint error.
- Use `chrome.storage.sync` (100 KB cap; out of scope for this blueprint).

**VERIFY**

- [ ] All keys in DevTools → Extensions → Storage start with an allowed prefix.
- [ ] `getBytesInUse()` < 5 MB after one week of normal usage.
- [ ] Toggling a feature flag in Options updates the SW within 100 ms
      (without an explicit message).
- [ ] Lint rule fails on any direct `chrome.storage.local.*` outside the adapter.

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Storage tier matrix | `./01-storage-tier-matrix.md` |
| Self-healing & migrations | `./07-self-healing-and-migrations.md` |
| localStorage TTL bridges | `./06-localstorage-bridges.md` |
| Error model | `../07-error-management/01-error-model.md` |
| Manifest permissions | `../02-folder-and-build/04-manifest-mv3.md` |
