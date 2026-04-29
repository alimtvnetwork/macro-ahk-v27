# Memory: architecture/indexeddb-injection-cache
Updated: 2026-03-30

The extension uses an IndexedDB-backed cache layer (`src/background/injection-cache.ts`) to store resolved script code, project metadata, configs, and namespace blobs for ultra-fast injection cold-starts. IndexedDB was chosen over `chrome.storage.local` for its superior handling of large blobs (no JSON serialization overhead), essentially unlimited quota, and structured cloning support.

Key behaviors:
- **Script code caching**: `resolveScriptCode()` in `script-resolver.ts` checks IndexedDB before `fetch()`, caching successful fetches for subsequent injections.
- **Version guard**: Every cache entry is tagged with `EXTENSION_VERSION`. Entries from older versions are treated as cache misses.
- **Deploy invalidation**: `chrome.runtime.onInstalled` (install or update) calls `invalidateCacheOnDeploy()` to clear all entries, ensuring fresh build artifacts are fetched after deployment.
- **Manual invalidation**: Users can click "Invalidate Cache" in the popup footer, which sends `INVALIDATE_CACHE` message to the background, clearing all IndexedDB cache entries.
- **Graceful degradation**: All cache operations are wrapped in try/catch — failures fall through to the existing `chrome.storage.local` + `fetch()` pipeline silently.

Root cause of UI not loading (Issue 88): When `resolveScriptCode()` fails to fetch from `web_accessible_resources` (stale deploy, missing build artifacts), it falls back to a stub that only logs a console.error — no UI is created. The IndexedDB cache mitigates this by preserving the last successful script code fetch.
