# Plan: Shared Bearer Token, DevTools Consolidation, and XPathUtils Injection Fix (v7.5)

**Status**: COMPLETED
**Date Completed**: 2026-02-19
**Version**: v7.5

## Summary
All three issues from the original plan were resolved:

1. **Shared Bearer Token** — Changed from project-scoped `ahk_bearer_{id}` to domain-scoped `ahk_bearer_token`. Both combo.js and macro-looping.js read from the same key. Migration logic copies old keys.

2. **DevTools Opening Multiple Times** — Reduced injection calls via `InjectJSQuick()` (v7.8). Console already focused from preceding injection, no F12 toggle needed. Self-cleaning title markers eliminated cleanup calls.

3. **XPathUtils NOT Found** — Sleep increased, deferred retry added in both controllers (500ms). XPathUtils binding retried if not available at startup.

## Files Changed
- `combo.js`, `macro-looping.js`, `JsInject.ahk`, `Combo.ahk`, `MacroLoop/Embed.ahk`
