# Memory: development/error-rca-sw-boot-chain
Updated: 2026-03-19

## Root Cause Analysis: Service Worker Boot Error Chain

Five errors were traced to **two root causes** that cascade through the system.

### Root Cause A: Vite Code-Splitting Creates Dynamic import()

**Problem**: Vite splits shared modules (e.g., `src/shared/messages.ts`) into separate chunks loaded via `import()`. Service workers prohibit dynamic `import()` per the HTML spec, causing an immediate fatal crash.

**Fix**: Added `manualChunks()` in `vite.config.ts` to force all `src/background/` and `src/shared/` modules into the `background/index` chunk, eliminating code-split boundaries.

**Prevention Rule**: Never allow Vite to code-split the background entry. Any new shared module imported by the service worker MUST be covered by the `manualChunks` function.

### Root Cause B: CSP Missing 'unsafe-eval' for Script Injection

**Problem**: `csp-fallback.ts` used `new Function(code)` to execute user scripts. This requires `'unsafe-eval'` in the CSP. The manifest only had `'wasm-unsafe-eval'`, so:
- MAIN world injection failed (target page CSP blocks eval) — expected, fallback handles this
- ISOLATED world fallback ALSO failed (extension CSP lacked 'unsafe-eval') — this was the bug

**Fix**: 
1. Added `'unsafe-eval'` to manifest CSP `extension_pages` directive
2. Replaced `new Function(code)` with indirect eval `(0, eval)(code)` for cleaner stack traces

**Prevention Rule**: Any code running in the extension context that uses eval-like constructs (`new Function`, `eval`) requires `'unsafe-eval'` in `manifest.json` CSP.

### Root Cause C: Osano Monkey-Patch Breaks MAIN World Script Injection

**Problem**: Osano.js (cookie consent manager) monkey-patches `HTMLHeadElement.prototype.appendChild`. When `executeInMainWorld` used `target.appendChild(script)`, Osano intercepted the call, re-parsed the script content in its own strict-mode sandbox, and threw `"Unexpected strict mode reserved word"` errors — silently killing injection with no UI or error output.

**Fix**: Changed `executeInMainWorld` to use `Node.prototype.appendChild.call(target, script)`, bypassing Osano's (and any other third-party) monkey-patch on `appendChild`.

**Prevention Rule**: Always use `Node.prototype.appendChild.call()` for DOM script injection to bypass third-party monkey-patches. Never use `element.appendChild()` directly.

### Root Cause D: Strict Mode Conflicts in Wrapper IIFE

**Problem**: The injection wrapper in `injection-wrapper.ts` prepended `"use strict"` to the IIFE. User scripts using block-scoped variables (`let`, `const`) at the top level of the IIFE caused parse errors (`"Unexpected identifier 'let'"`) in some environments where strict mode interacted badly with the wrapper structure.

**Fix**: Removed the `"use strict"` directive from the wrapper IIFE output.

**Prevention Rule**: Do not add `"use strict"` to injected wrapper code. Modern JS engines default to strict mode inside modules; for non-module script injection, explicit strict mode can conflict with wrapped user code.

### Root Cause E: ISOLATED World Requires eval, Not Script Tags

**Problem**: `<script>` tags appended from ISOLATED world still execute in MAIN world context (per Chrome extension architecture). When CSP fallback switched to ISOLATED world but still used script-tag injection, the code ran in MAIN world anyway — defeating the fallback.

**Fix**: Split execution into two functions: `executeInMainWorld` (script tag + `Node.prototype.appendChild.call`) and `executeInIsolatedWorld` (indirect eval `(0, eval)(code)`). The dispatcher in `tryInject` selects based on the `world` parameter.

**Prevention Rule**: ISOLATED world execution MUST use `eval` or `new Function`, never script tag injection. Script tags always run in MAIN world regardless of which world appends them.

### Cascade Effects (not separate bugs)
- **"DbManager not bound"** — SW crashed before `bindAllHandlers()` ran (fixed by Root Cause A)
- **"Could not establish connection"** — Popup messaged dead SW (fixed by Root Cause A)
- **WASM CSP errors** — SW crash prevented WASM init; also CSP now correct (fixed by both A + B)
- **Silent injection failure (no UI, no errors)** — Osano swallowed the error (fixed by C + D + E)
