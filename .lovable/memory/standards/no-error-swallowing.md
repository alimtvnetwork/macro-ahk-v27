---
name: No error swallowing
description: Catch blocks must Logger.error() or rethrow — never silently return a sentinel
type: constraint
---

A `catch` block MUST NOT:

- Return `null`, `undefined`, `false`, `0`, `""`, `[]`, `{}`, or any other sentinel value without first calling `RiseupAsiaMacroExt.Logger.error(functionName, message, error)` (or the equivalent project logger).
- Be empty (`catch {}` or `catch (_) {}`).
- Swallow with only a `console.debug` / `console.warn`.

The minimum acceptable pattern:

```ts
try {
    doWork();
} catch (caught) {
    RiseupAsiaMacroExt.Logger?.error("PaymentBannerHider.show", "Failed to show banner", caught);

    throw caught; // or: return a typed Result.err(...) — but never a hidden sentinel
}
```

**Why**: Returning `null` from a catch hides the failure from every caller and from the diagnostics export. The 2026-04-24 banner-hider RCA called this out explicitly. Project standard `error-logging-via-namespace-logger` already required `Logger.error()` in every catch — this rule restates it as a hard ban on the swallow pattern.

**How to apply**: Search every catch block in the new file for one of: `Logger.error(`, `throw `, `return Result.err(`. If none present, the file fails review.
