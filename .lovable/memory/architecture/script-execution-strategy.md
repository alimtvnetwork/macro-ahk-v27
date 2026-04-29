# Script Execution Strategy

Updated: 2026-03-19

## MAIN World Injection
- Creates a `<script>` tag with `textContent = code`
- Injects at the **bottom of `<body>`** (fallback: `<html>`) using `Node.prototype.appendChild.call(...)`
- Sets `defer="defer"`, `defer=true`, and `async=false` for explicit DOM/debug visibility
- Keeps only the latest marker script (`data-marco-injection="main-inline"`) so users can inspect the actual injected node
- Falls back to `Element.prototype.insertAdjacentElement` if appendChild itself is patched

## Fallback Chain (v1.40.0+)
When MAIN world injection fails (CSP block or Osano-style interference):

### 1. `chrome.userScripts.execute()` (Chrome 135+, preferred)
- Uses the `userScripts` permission and `chrome.userScripts.execute()` API
- Executes raw code strings in a dedicated `MARCO_FALLBACK` world with its own CSP
- World configured once during service worker boot via `configureUserScriptWorld()`
- Fully MV3-compliant — no eval, no unsafe-eval in extension CSP

### 2. Blob URL injection (Chrome < 135, legacy fallback)
- Creates a `Blob([code])`, generates `URL.createObjectURL`, sets as `script.src`
- Injected from ISOLATED world via `chrome.scripting.executeScript`
- Injects at bottom of `<body>` with `defer="defer"` and marker `data-marco-injection="isolated-blob"`
- Keeps marker script visible for debugging; revokes Blob URL on load/error

## CSP Preflight Guard
- Smoke test (`smoke-test.ts`) blocks builds if `'unsafe-eval'` is in `extension_pages` CSP
- Only `'wasm-unsafe-eval'` is permitted (required for sql.js WASM)
- `userScripts` permission is required in smoke test

## Strict Mode
- Injection wrapper explicitly omits `'use strict'` to support top-level `const`/`let` in injected IIFEs
