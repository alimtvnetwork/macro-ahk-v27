# Storage Tier Matrix

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Active
**AI Confidence:** Production-Ready
**Ambiguity:** None

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Why this matters

Picking the wrong storage tier is the most common architectural mistake in
Chrome extensions. Symptoms include: lost data after Chrome closes,
"unexpected token" crashes when the service worker rehydrates, broken
behaviour in Incognito, quota errors that surface only after weeks of use,
and JWTs leaking into other origins.

This file is the **decision tool**. Read it before adding any persistent
state, then jump to the dedicated tier file (`02-` … `06-`) for the
implementation pattern.

---

## The four tiers at a glance

| # | Tech | Lives in | Scope | Capacity | Persists across | Sync API? | Latency | Use for | Avoid for |
|---|------|----------|-------|----------|-----------------|-----------|---------|---------|-----------|
| 1 | **SQLite (sqlite-wasm + OPFS)** | Background SW | Extension (single global DB) | Practically unlimited (OPFS quota ≈ 60% of disk) | Browser restart ✅ · Extension reload ✅ · Extension reinstall ❌ · "Clear browsing data → cookies & site data" ❌ | No — async only | ~1–5 ms per query | Sessions, errors, namespaces, project data, anything relational | Page-side hot caches (cross-world hop too expensive) |
| 2 | **IndexedDB** | Page (per origin) | Per origin (each host gets its own DB) | ~50 % of free disk (per origin group) | Browser restart ✅ · "Clear site data" for that origin ❌ | No — async only | ~5–20 ms per transaction | Per-origin hot caches, large structured docs, dual-cache patterns | Cross-origin shared data, anything the SW must read |
| 3 | **chrome.storage.local** | Extension (background + UI) | Extension global | ~10 MB default · ~unlimited with `unlimitedStorage` permission | Browser restart ✅ · Extension reload ✅ · Extension reinstall ❌ | No — async only (callback / promise) | ~10–50 ms per write (debounced flush) | Manifests, builtin scripts, bootstrap config, feature flags | Anything secret, anything > 1 MB without `unlimitedStorage`, hot read paths |
| 4 | **localStorage** | Page (per origin) | Per origin | ~5 MB hard | Browser restart ✅ · "Clear site data" ❌ | **Yes — synchronous** | < 1 ms read, < 1 ms write | TTL bridges (e.g., short-lived MAIN-world tokens), small UI prefs | Anything > 100 KB · long-lived secrets · structured data · cross-tab coordination |

> Tier 1 is the **default** when you do not know. Promote down only with
> a written reason — every other tier has at least one footgun.

---

## Decision tree

Answer the questions in order. The first matching row wins.

```
1. Does the data need to be queryable / joinable / aggregated (SQL)?
   YES → Tier 1: SQLite
   NO  → continue

2. Is the data scoped to a single web origin and read by content scripts
   on the page (not the background)?
   YES → Tier 2: IndexedDB (or Tier 4 if < 100 KB and TTL ≤ 10 min)
   NO  → continue

3. Is the data extension-wide config / manifest / feature flags
   (small, infrequent writes, must survive SW suspension)?
   YES → Tier 3: chrome.storage.local
   NO  → continue

4. Is the data a short-lived bridge from the extension to a MAIN-world
   page script (≤ 10 min, no PII, < 100 KB)?
   YES → Tier 4: localStorage TTL bridge
   NO  → re-evaluate; you probably want Tier 1.
```

---

## Quick-reference per data shape

| Data shape | Recommended tier | Rationale |
|------------|------------------|-----------|
| Audit log / event stream | Tier 1 (SQLite) | Append-heavy + range queries by timestamp |
| Per-project key/value config | Tier 1 (SQLite — ProjectConfig table) | Joined with project rows, hash-tracked re-seed |
| Compiled prompt cache (large HTML/JSON) | Tier 2 (IndexedDB dual-cache) | Page-side hot read, large blobs |
| Manifest of installed builtin scripts | Tier 3 (chrome.storage.local) | Read on every SW activation, small |
| Feature flag set | Tier 3 (chrome.storage.local) | Small, infrequent writes, SW + UI both read |
| Bearer token mirror for MAIN world | Tier 4 (localStorage TTL bridge) | Sync read in MAIN, ≤ 10 min TTL, scoped key |
| User UI preferences (theme, sidebar width) | Tier 3 if extension-wide; Tier 4 if per-origin |
| Telemetry counter (in-memory cache, periodic flush) | Tier 1 with in-memory write-back | Aggregation queries needed |
| Binary asset (icon, WASM, image) | Bundled in `dist/` (no runtime tier) | Code, not data |

---

## Persistence reality check

Chrome's persistence model is **not** what most developers assume.
Memorise this table — then verify by toggling each option in
`chrome://settings/cookies` and `chrome://extensions`.

| Action | Tier 1 SQLite (OPFS) | Tier 2 IndexedDB | Tier 3 chrome.storage.local | Tier 4 localStorage |
|--------|----------------------|------------------|-----------------------------|---------------------|
| Browser restart | ✅ kept | ✅ kept | ✅ kept | ✅ kept |
| Extension reload (`chrome://extensions → reload`) | ✅ kept | ✅ kept | ✅ kept | ✅ kept (page reload separate) |
| SW suspension (every ~30 s idle) | ✅ kept (handle re-opens) | ✅ kept | ✅ kept | ✅ kept |
| Update via Web Store | ✅ kept | ✅ kept | ✅ kept | ✅ kept |
| User clicks **Remove** in `chrome://extensions` | ❌ wiped | n/a (page-side, not affected by extension removal) | ❌ wiped | n/a |
| User clicks "Clear browsing data → Cookies and other site data" | ❌ wiped (OPFS counts as site data) | ❌ wiped (per origin selected) | ✅ kept (extension storage is separate) | ❌ wiped (per origin selected) |
| Incognito mode | Empty separate store | Empty separate store | Empty separate store | Empty separate store |
| User profile reset | ❌ wiped | ❌ wiped | ❌ wiped | ❌ wiped |

**Implication:** never store anything in OPFS or IndexedDB that you are
not willing to recompute or re-seed. Always pair Tier 1 with the
self-healing pattern in `07-self-healing-and-migrations.md`.

---

## Capacity & quota planning

| Tier | Free quota | Hard ceiling | Quota check API |
|------|------------|--------------|-----------------|
| Tier 1 SQLite (OPFS) | ≥ 1 GB on most desktops | ~60 % of free disk (StorageManager) | `navigator.storage.estimate()` |
| Tier 2 IndexedDB | Same group quota as Tier 1 | Shared with OPFS — they compete | `navigator.storage.estimate()` |
| Tier 3 chrome.storage.local | 10 MB | ~Unlimited if `"permissions": ["unlimitedStorage"]` | `chrome.storage.local.getBytesInUse()` |
| Tier 4 localStorage | 5 MB | 5 MB hard | `JSON.stringify(localStorage).length` (best-effort) |

Budget rule of thumb: if a single tier crosses **50 %** of its quota you
have already mis-tiered. Promote the largest objects to the next tier up
or move them to bundled assets.

---

## Cross-world cost

Reads that **cross worlds** are 10–100× slower than same-world reads.
Plan around this:

| Caller world | Target tier | Cost class |
|--------------|-------------|------------|
| Background SW → SQLite | Same world | Cheap |
| Background SW → chrome.storage.local | Same world | Cheap |
| Page MAIN → IndexedDB | Same world | Cheap |
| Page MAIN → localStorage | Same world | Cheapest (sync) |
| Page MAIN → chrome.storage.local | Cross-world (via content script bridge) | Expensive — never on hot path |
| Page MAIN → SQLite | Cross-world (via content script bridge) | Very expensive — cache page-side |
| Background SW → IndexedDB | Cross-world (impossible directly — must go through a page) | Forbidden in this blueprint |

If you find yourself wanting the SW to read IndexedDB, the data is in
the wrong tier — promote to Tier 1.

---

## Anti-patterns (DO NOT)

- **DO NOT** store JWTs in `chrome.storage.local` long-term — use the
  Tier 4 TTL bridge with a strict expiry, or hold them in memory only.
- **DO NOT** put binary blobs > 100 KB in `chrome.storage.local` even
  with `unlimitedStorage` — writes are slow and contend with config.
- **DO NOT** use `localStorage` for anything > 100 KB or anything you
  expect to survive a "Clear site data" click.
- **DO NOT** call `localStorage` from the background SW — it does not
  exist there. Use `chrome.storage.session` for SW-only volatile state.
- **DO NOT** write to SQLite from a hot page-side loop. Buffer in IDB
  and flush via a single message.
- **DO NOT** rely on `chrome.storage.sync` in this blueprint — it is
  capped at 100 KB and silently drops writes when unavailable. If you
  truly need cross-device sync, document it as an explicit exception.

---

## DO / DO NOT / VERIFY checklist

**DO**

- Pick a tier with the decision tree above before writing the first line.
- Document the chosen tier in a code comment at the top of the module.
- Pair every Tier 1 / Tier 2 surface with a self-healing reseed path.
- Run `navigator.storage.estimate()` at startup and log a warning over 50 %.

**DO NOT**

- Mix tiers for the same logical record (e.g., manifest in Tier 3 but
  one field in Tier 1) — pick one.
- Cache Tier 1 data in `localStorage` "for speed" — use IndexedDB.
- Catch quota errors silently — they MUST surface as `AppError` with
  CODE-RED `path` + `missing` + `reason` per `../07-error-management/03-file-path-error-rule.md`.

**VERIFY**

- [ ] Each storage call site is annotated with its tier number (1–4).
- [ ] No `localStorage.*` reference in `src/background/`.
- [ ] No `chrome.storage.*` reference in MAIN-world SDK code.
- [ ] `getBytesInUse()` reported in the diagnostic ZIP export.
- [ ] Self-healing reseed tested by deleting OPFS via DevTools and
      reloading the extension.

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Folder index | `./00-overview.md` |
| Tier 1 — SQLite in background | `./02-sqlite-in-background.md` |
| Tier 1 — Schema conventions | `./03-sqlite-schema-conventions.md` |
| Tier 2 — IndexedDB page cache | `./04-indexeddb-page-cache.md` |
| Tier 3 — chrome.storage.local | `./05-chrome-storage-local.md` |
| Tier 4 — localStorage bridges | `./06-localstorage-bridges.md` |
| Self-healing & migrations | `./07-self-healing-and-migrations.md` |
| Error model (CODE-RED rule) | `../07-error-management/03-file-path-error-rule.md` |
