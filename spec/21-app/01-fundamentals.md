# 21.01 — App Fundamentals

**Version:** 1.0.0  
**Status:** Active  
**Updated:** 2026-04-22

---

## What this app is

The **Riseup Asia Macro Extension** is a Chrome Manifest-V3 extension that automates workspace, project, and macro-loop operations on the Lovable web IDE. It injects a controller UI into target pages, manages bearer-token authentication, and persists session/diagnostic data via SQLite (background) and IndexedDB / chrome.storage / OPFS (page side).

## Top-level boundaries

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Background service worker | `src/background/` | SQLite, message router, injection orchestration, namespace registration |
| Content / MAIN-world scripts | `src/content/`, `standalone-scripts/` | Macro Controller UI, page interaction, prompt dropdown |
| Options / popup pages | `src/options/`, `src/popup/` | User configuration, project selector |
| Shared SDK | `RiseupAsiaMacroExt.*` namespace | Logger, message bus, require() loader, Auth Bridge |

## Lifecycle (6 phases)

1. **Install + Bootstrap** — manifest load, SQLite init, builtin script self-heal
2. **Service-worker activation** — message router up, error broadcast subscribed
3. **Page injection** — 7-stage pipeline: dependency resolve → namespace bootstrap → require → controller mount → auth gate → UI ready → marker set
4. **Auth readiness gate** — unified 10s budget via `getBearerToken()`
5. **User interaction** — Macro Controller UI, prompt dropdown, workspace switch, macro loop
6. **Teardown / recovery** — diagnostic dump, error modal, log export

## Storage tiers (4 layers)

1. **SQLite** (background, unlimited, persistent) — sessions, errors, namespaces
2. **IndexedDB** (page) — `marco_prompts_cache` dual cache (JsonCopy / HtmlCopy)
3. **localStorage** (page) — bearer-token TTL bridge
4. **chrome.storage.local** (extension) — instruction manifest, builtin scripts

## Key invariants

- Dark-only theme; no light mode toggle.
- Single auth path: `getBearerToken()` only — no legacy fallbacks.
- Sequential fail-fast — no recursive retry / exponential backoff.
- All file/path errors must include exact path, missing item, and reasoning (CODE RED).
- Unified version across `manifest.json`, `constants.ts`, and standalone scripts.

## Cross-References

- Features: [`02-features/`](./02-features/)
- Data & API: [`03-data-and-api/`](./03-data-and-api/)
- Diagrams: [`04-design-diagrams/`](./04-design-diagrams/)
- Issues & RCAs: [`../22-app-issues/`](../22-app-issues/)
