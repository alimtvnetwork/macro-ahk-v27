# Script Injection Pipeline Stages

Updated: 2026-04-07

The project uses a structured script injection pipeline with cache gate and CSP bypass:

## Pre-Pipeline
- **User Trigger**: Run Scripts (normal) or Force Run (forceReload=true)
- **Loading Toast**: spinner injected into tab immediately
- **Cache Gate**: IndexedDB lookup by version key. HIT → skip Stages 0–3. Force Run → delete cache, rebuild.

## Pipeline Stages
1. **Stage 0a: ensureBuiltinScriptsExist** — self-heal missing built-in scripts from bundled /scripts/
2. **Stage 0b: prependDependencyScripts** — topological sort, prepend deps before dependents
3. **Stage 1: resolveInjectionRequestScripts** — load code + config + theme from chrome.storage.local. Unresolvable = HARD ERROR.
4. **Stage 2: Tab Environment Prep (parallel Promise.all)**
   - 2a: `bootstrapNamespaceRoot()` — creates `window.RiseupAsiaMacroExt = { Projects: {} }` in MAIN world (NO fallback). CSP blocked → DEGRADED.
   - 2b: `ensureRelayInjected()` — content script relay in ISOLATED world
   - 2c: `seedTokensIntoTab()` — bearer token with 2-min TTL
5. **Stage 3: Wrap + Prepare** — CSS check → sequential or batch mode. IIFE wrapping + SDK preamble. Batch payload cached in IndexedDB.
6. **Stage 4: Execute — 4-tier CSP fallback**:
   - Tier 1: MAIN World Blob injection (primary)
   - Tier 2: USER_SCRIPT world via chrome.userScripts.execute (Chrome 135+)
   - Tier 3: ISOLATED World Blob injection
   - Tier 4: ISOLATED World Eval (last resort)
   - Non-primary tiers → health = DEGRADED
7. **Stage 5: Populate Data Namespaces (parallel with Stages 3+4)**
   - 5a: `RiseupAsiaMacroExt.Settings` + `docs.llmGuide`
   - 5b: `RiseupAsiaMacroExt.Projects.<CodeName>` with vars Map

## Post-Pipeline
- Log mirroring: Tab DevTools (console.groupCollapsed) + SQLite + OPFS session log
- Performance budget check (configurable via settings)
- Post-injection verification: 6 globals (window.marco, RiseupAsiaMacroExt, MacroController, api.mc, UI container, marker)
- Final toast: success (green) / warning (amber) / error (red)

## Cache Invalidation (3 layers)
1. `chrome.runtime.onInstalled` clears cache
2. Version key mismatch auto-rebuilds
3. PowerShell `run.ps1` as safety net
