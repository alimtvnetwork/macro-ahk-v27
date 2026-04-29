# Injection Pipeline — Version-Based Cache Control

**Created**: 2026-04-07
**Status**: Approved
**Diagram**: `standalone-scripts/macro-controller/diagrams/injection-pipeline-workflow.mmd`
**Image**: `standalone-scripts/macro-controller/diagrams/images/injection-pipeline-workflow.png`

---

## Summary

The injection pipeline uses a **version-based cache** stored in IndexedDB (`marco_injection_cache`). The cache key is the **extension version string** (e.g. `"2.5.0"`) — the same value from `chrome.runtime.getManifest().version`. No content hashing is used.

---

## Cache Key

| Property | Value |
|----------|-------|
| Store name | `marco_injection_cache` |
| Key | Extension version string from `chrome.runtime.getManifest().version` |
| Value | `{ payload: string, storedAt: number, scriptCount: number }` |
| Source of truth | `manifest.json` → `version` field, mirrored in `EXTENSION_VERSION` constant |

One single cache entry exists at a time. When a new version is stored, the previous entry is removed.

---

## Cache Decision Flow

```
Start pipeline (mode = normal | forceReload)
  |
  v
Check forceReload flag
  |
  +-- forceReload = true (user clicked "Force Run Scripts")
  |     LOG INFO: [cache] FORCE RUN — cache bypassed by user
  |     Delete cached entry if exists
  |     Run Stages 0-3, store new payload under current version
  |
  +-- forceReload = false (user clicked "Run Scripts")
        |
        v
      Read current version: chrome.runtime.getManifest().version
        |
        v
      Open IndexedDB store: marco_injection_cache
        |
        v
      Look up entry by version key
        |
        +-- Entry found AND version matches current
        |     LOG INFO: [cache] HIT version=X.Y.Z, payload=N bytes
        |     Skip Stages 0-3, jump to Stage 4 (Execute in Tab)
        |
        +-- Entry found BUT version does NOT match
        |     LOG INFO: [cache] VERSION MISMATCH cached=A.B.C current=X.Y.Z — rebuilding
        |     Delete stale entry
        |     Run Stages 0-3, store new payload under current version
        |
        +-- No entry exists (cache empty or cleared)
        |     LOG INFO: [cache] MISS — no cached payload found, rebuilding
        |     Run Stages 0-3, store new payload under current version
        |
        +-- Entry exists but payload is unreadable/corrupt
              LOG ERROR: [cache] CORRUPT
                Path: IndexedDB → marco_injection_cache → key="${currentVersion}"
                Missing: Valid payload string (got undefined/null/non-string)
                Reason: Stored entry exists but payload field is unreadable — possible IndexedDB corruption or schema drift
              Delete corrupt entry
              Run Stages 0-3, store new payload under current version
```

---

## Force Run (Manual Cache Bypass)

The popup provides **two buttons**:

| Button | Behavior |
|--------|----------|
| **Run Scripts** | Normal path — uses cache if version matches |
| **Force Run Scripts** | Always bypasses cache, deletes existing entry, rebuilds from Stages 0-3 |

### When to use Force Run

- When the user suspects cached data is stale or incorrect
- After manual script edits that don't change the extension version
- For debugging injection issues

### Implementation

```typescript
// handleInjectScripts accepts a forceReload flag
async function handleInjectScripts(tabId: number, forceReload = false) {
  if (forceReload) {
    await clearInjectionCache();
    console.log("[cache] FORCE RUN — cache bypassed by user");
    // Proceed directly to Stage 0a (skip cache gate)
  } else {
    // Normal cache decision gate
  }
}
```

---

## Canonical Version Source

The single canonical version source is:

1. **`chrome.runtime.getManifest().version`** — read at runtime
2. This value originates from `manifest.json` → `"version"` field
3. The same value is mirrored in `src/shared/constants.ts` → `EXTENSION_VERSION`
4. All three MUST be identical (enforced by `check-version-sync.mjs` at build time)

One shared version key is used for the **entire injection payload** — not per-script-group.

---

## Cache Storage After Build

After Stage 3 (Batch Mode or Sequential Mode) produces the final wrapped payload:

```typescript
const entry = {
  payload: combinedWrappedIIFEString,
  storedAt: Date.now(),
  scriptCount: resolvedScripts.length,
};
await idbSet("marco_injection_cache", currentVersion, entry);
console.log(`[cache] Stored payload for version=${currentVersion}, size=${entry.payload.length} bytes`);
```

---

## Deployment Cache Invalidation

### Requirement

When a new build is deployed, the cached payload MUST be cleared **automatically** so the next injection rebuilds with fresh artifacts.

### How It Works (Three Layers)

#### Layer 1: `chrome.runtime.onInstalled` (Automatic)

When the extension is installed or updated, Chrome fires `onInstalled`. The handler calls `invalidateCacheOnDeploy()` which clears all IndexedDB cache entries.

```typescript
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install" || details.reason === "update") {
    await clearInjectionCache();
    console.log("[deploy] Injection cache cleared on", details.reason);
  }
});
```

This is the primary and most reliable invalidation path. Since a version change triggers an extension update, the version key would also mismatch — providing double protection.

#### Layer 2: Version Key Mismatch (Automatic)

Even if `onInstalled` somehow fails to clear the cache, the version key mismatch at the Cache Decision Gate will trigger a rebuild. The old version's entry simply won't match the new version.

#### Layer 3: PowerShell Deploy Script (`run.ps1`)

The deploy script should send an `INVALIDATE_CACHE` message to the extension as a post-deploy step:

```powershell
# After copying dist/ to extension directory:
# Send cache invalidation message via Chrome's native messaging or
# by touching a sentinel file the background worker watches.

Write-Host "[deploy] Clearing injection cache..."

# Option A: If extension is already loaded, use chrome.runtime.sendMessage
# via a helper page or native messaging host
# Option B: Delete the IndexedDB database files directly from the Chrome profile
#   $idbPath = "$ChromeUserDataDir\Default\IndexedDB\chrome-extension_${extId}_0.indexeddb.leveldb"
#   Remove-Item -Path $idbPath -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "[deploy] Injection cache invalidation complete"
```

**Note**: Layer 3 is a safety net. Layers 1 and 2 handle cache invalidation reliably in all normal scenarios.

---

## Error Logging Standard

All HARD ERROR and LOG ERROR entries in the injection pipeline MUST follow this format for AI-readability:

```
[ERROR] <module>: <what failed>
  Path: <exact file, storage key, or resource path>
  Missing: <specific item not found>
  Reason: <why it wasn't found or failed>
```

### Stage-by-Stage Error Log Examples

#### Stage 0a — `ensureBuiltinScriptsExist`

```
[ERROR] ensureBuiltinScriptsExist: Built-in script not found after self-heal
  Path: chrome.storage.local["script:sdk-preamble"]
  Missing: sdk-preamble (ID: builtin_sdk_preamble_v1)
  Reason: Storage key empty AND bundled fallback at /scripts/sdk-preamble.js also missing from extension package

[ERROR] ensureBuiltinScriptsExist: Self-heal source file missing
  Path: chrome.runtime.getURL("/scripts/relay-installer.js")
  Missing: relay-installer.js bundled asset
  Reason: File not present in extension dist/ — build may have excluded it or vite config is misconfigured
```

#### Stage 0b — `prependDependencyScripts`

```
[ERROR] prependDependencyScripts: Dependency not found in resolved script list
  Path: project.config.json → scripts[2].dependsOn = ["utility-helpers"]
  Missing: Script ID "utility-helpers" (required by "main-controller")
  Reason: "utility-helpers" is declared as a dependency but does not exist in chrome.storage.local or the project script manifest

[ERROR] prependDependencyScripts: Circular dependency detected
  Path: project.config.json → scripts dependency graph
  Missing: Valid topological sort (cycle: A → B → C → A)
  Reason: Scripts A, B, C form a circular dependsOn chain — cannot determine injection order
```

#### Stage 1 — `resolveInjectionRequestScripts`

```
[ERROR] resolveInjectionRequestScripts: Script code not found
  Path: chrome.storage.local["scriptCode:my-automation-v2"]
  Missing: Code body for script ID "my-automation-v2"
  Reason: Storage key exists but value is null/undefined — script may have been deleted without removing its config entry

[ERROR] resolveInjectionRequestScripts: Config JSON missing for bound script
  Path: chrome.storage.local["scriptConfig:dashboard-enhancer"]
  Missing: Config JSON for script "dashboard-enhancer" (configBound=true in manifest)
  Reason: Script manifest declares configBound=true but no matching config entry exists in storage

[ERROR] resolveInjectionRequestScripts: Zero scripts resolved — pipeline halting
  Path: Injection request for tabId=1234, url=https://example.com
  Missing: Any resolvable script (0 of 5 resolved)
  Reason: All 5 scripts failed resolution — see individual ERROR entries above for per-script reasons
```

#### Stage 2a — `bootstrapNamespaceRoot`

```
[ERROR] bootstrapNamespaceRoot: CSP blocked namespace creation in MAIN world
  Path: chrome.scripting.executeScript → tabId=1234, world=MAIN
  Missing: window.RiseupAsiaMacroExt global object
  Reason: Page CSP header "script-src 'self'" blocks inline script execution — blob URL fallback also rejected
```

#### Stage 2b — `ensureRelayInjected`

```
[ERROR] ensureRelayInjected: Relay content script injection failed
  Path: chrome.scripting.executeScript → tabId=1234, world=ISOLATED, file=relay-installer.js
  Missing: __marcoRelayInstalled marker in ISOLATED world
  Reason: chrome.scripting.executeScript threw: "Cannot access a chrome:// URL" — tab is a restricted Chrome internal page
```

#### Stage 2c — `seedTokensIntoTab`

```
[ERROR] seedTokensIntoTab: Bearer token not found in any source
  Path: chrome.storage.local["marco_bearer_token"]
  Missing: JWT bearer token string
  Reason: Storage key is empty, and cookie "marco_auth" on domain .lovable.dev also returned null — user may not be authenticated
```

#### Stage 3 — Batch/Sequential Injection

```
[ERROR] wrapScriptIIFE: Script body is empty after IIFE wrapping
  Path: In-memory payload for script "loop-cycle" (index 3 of 5)
  Missing: Non-empty wrapped IIFE string
  Reason: Original script code was an empty string — storage may contain a placeholder entry with no actual code
```

#### Stage 4 — Execute in Tab

```
[ERROR] executeInTab: Blob URL injection blocked by CSP
  Path: document.documentElement → <script src="blob:...">
  Missing: Executed script in MAIN world
  Reason: Page CSP "script-src 'self' cdn.example.com" does not allow blob: URLs — falling back to ISOLATED world (DEGRADED)

[ERROR] executeInTab: ISOLATED world fallback also failed
  Path: chrome.scripting.executeScript → tabId=1234, world=ISOLATED
  Missing: Any successful script execution path
  Reason: Both MAIN (blob URL blocked by CSP) and ISOLATED (chrome.scripting threw "Cannot access contents of URL") failed — injection impossible on this page
```

#### Stage 5 — Populate Namespaces

```
[ERROR] populateSettingsNamespace: Settings namespace injection failed
  Path: chrome.scripting.executeScript → tabId=1234, world=MAIN → window.RiseupAsiaMacroExt.Settings
  Missing: Settings object in page namespace
  Reason: MAIN world execution blocked by CSP — settings will not be available to page scripts (health=DEGRADED)
```

#### Post-Pipeline — Global Verification

```
[WARN] verifyPostInjectionGlobals: Expected global missing
  Path: window.marco (verified via chrome.scripting.executeScript in MAIN world)
  Missing: window.marco SDK helper object
  Reason: SDK preamble script may have thrown during initialization — check script-specific error logs above

[WARN] verifyPostInjectionGlobals: UI container not found in DOM
  Path: document.querySelector("#marco-controller-root")
  Missing: DOM element with id="marco-controller-root"
  Reason: MacroController class constructor may have failed before creating the UI container — or CSP blocked the script entirely
```

#### Cache Errors

```
[ERROR] injectionCache: Cached payload corrupt
  Path: IndexedDB → marco_injection_cache → key="2.5.0"
  Missing: Valid payload string (got typeof=undefined)
  Reason: Stored entry exists but payload field is unreadable — possible IndexedDB corruption or schema drift between versions

[ERROR] injectionCache: IndexedDB open failed
  Path: indexedDB.open("marco_injection_cache", 1)
  Missing: IDBDatabase connection
  Reason: DOMException: "QuotaExceededError" — browser storage quota full, cannot read or write cache
```

---

## Logging Requirements

| Event | Level | Message Format |
|-------|-------|----------------|
| Cache lookup start | INFO | `[cache] Checking version=${currentVer}` |
| Cache HIT | INFO | `[cache] HIT version=${ver}, payload=${size} bytes` |
| Cache MISS (empty) | INFO | `[cache] MISS — no cached payload found, rebuilding` |
| Cache MISS (version mismatch) | INFO | `[cache] VERSION MISMATCH cached=${old} current=${new} — rebuilding` |
| Cache MISS (corrupt) | ERROR | Full Path/Missing/Reason format (see above) |
| Cache stored | INFO | `[cache] Stored payload for version=${ver}, size=${n} bytes` |
| Deploy invalidation | INFO | `[deploy] Injection cache cleared on ${reason}` |
| Force Run bypass | INFO | `[cache] FORCE RUN — cache bypassed by user` |
| Manual invalidation | INFO | `[cache] Manual invalidation by user` |
| Stage 0a failure | ERROR | Full Path/Missing/Reason format (see above) |
| Stage 0b dependency missing | ERROR | Full Path/Missing/Reason format (see above) |
| Stage 1 script unresolvable | ERROR | Full Path/Missing/Reason format (see above) |
| Stage 1 zero resolved | ERROR | Full Path/Missing/Reason format (see above) |
| Stage 2a CSP block | ERROR | Full Path/Missing/Reason format (see above) |
| Stage 2b relay failure | ERROR | Full Path/Missing/Reason format (see above) |
| Stage 2c token missing | ERROR | Full Path/Missing/Reason format (see above) |
| Stage 4 blob CSP block | ERROR | Full Path/Missing/Reason format (see above) |
| Stage 4 total failure | ERROR | Full Path/Missing/Reason format (see above) |
| Stage 5 namespace fail | ERROR | Full Path/Missing/Reason format (see above) |
| Post-pipeline global missing | WARN | Full Path/Missing/Reason format (see above) |

All logs are mirrored to:
1. Tab DevTools via `console.groupCollapsed`
2. Extension SQLite via `recordInjection`
3. OPFS session log

---

## Startup Diagnostic Log

On extension startup (service worker activation), log the current state:

```
[startup] Runtime version=2.5.0, cached version=2.4.0 (STALE — will rebuild on next inject)
[startup] Runtime version=2.5.0, cached version=2.5.0 (FRESH — cache will be used)
[startup] Runtime version=2.5.0, cached version=NONE (EMPTY — will build on first inject)
```

---

## Deployment Checklist Item

Add to the pre-release regression checklist:

- [ ] Verify injection cache is cleared after deploy (check DevTools for `[cache] MISS` on first inject after deploy)

---

## Ambiguities Resolved

| Question | Answer |
|----------|--------|
| Which version? | `chrome.runtime.getManifest().version` — the extension version |
| One key or per-script? | One shared key for the entire injection payload |
| Where is deploy removal executed? | Primary: `chrome.runtime.onInstalled`. Backup: version key mismatch. Safety net: PowerShell `run.ps1` |

---

```
If you have any question and confusion, feel free to ask, and if you are creating tasks for creating
multiple tasks, and if it is bigger ones, then do it in a way so that if we say next, you do those
remaining tasks. Do you understand? Always add this part at the end of the writing inside the code
block. Do you understand? Can you please do that?
```