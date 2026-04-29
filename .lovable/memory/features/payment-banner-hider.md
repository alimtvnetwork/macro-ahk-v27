---
name: Payment Banner Hider
description: Auto-injected global script hiding the Lovable "Payment issue detected." banner — class-based, CSS-on-disk, post-RCA reference implementation
type: feature
---
# Payment Banner Hider (v2.230.0)

Standalone-script project at `standalone-scripts/payment-banner-hider/` that
auto-injects on `https://lovable.dev/*` and hides the sticky "Payment issue
detected." banner at XPath `/html/body/div[2]/main/div/div[1]`.

## Architecture (post-Issue-98 RCA refactor — 2026-04-24)

Reference implementation of the standards index. Files:

- `src/index.ts` — `class PaymentBannerHider` entry point + bootstrap
- `src/banner-locator.ts` — `class BannerLocator` (injected dependency)
- `src/types.ts` — `enum BannerState`, constants, `PaymentBannerHiderApi`
- `src/globals.d.ts` — `declare global { interface Window … }` (no casts)
- `src/instruction.ts` — declarative seed manifest with `assets.css` entry
- `css/payment-banner-hider.css` — scoped via `[data-marco-banner-hider]`, zero `!important`

## Behavior
- Auto-runs (no manual "Run script" click), `world: MAIN`, `isGlobal: true`, `loadOrder: 2`.
- CSS3 transition declared in the sibling `.css` file fades to black,
  collapses height/opacity over 900ms, then `display:none` at 1000ms.
- `MutationObserver` on `document.body` re-detects React re-renders /
  SPA navigation. Idempotent via `data-marco-banner-hider` attribute.
- Only acts when exact text `Payment issue detected.` is present.

## Build wiring
- `package.json` script: `build:payment-banner-hider` runs tsc → vite IIFE
  bundle → `scripts/copy-payment-banner-hider-css.mjs` (copies CSS into dist).
- `scripts/check-standalone-dist.mjs` requires `payment-banner-hider.js` AND
  `payment-banner-hider.css` in dist.
- Also wired into `build:extension`.

## Debug API
`window.PaymentBannerHider.check()` — manual one-pass detection trigger.
`window.PaymentBannerHider.version` — version string.

## Standards compliance (audited 2026-04-24)
| Standard | Compliant |
|---|---|
| `class-based-standalone-scripts` | ✓ single class + injected `BannerLocator` |
| `standalone-scripts-css-in-own-file` | ✓ `css/payment-banner-hider.css` |
| `no-css-important` | ✓ zero `!important` (scoped attribute selector) |
| `no-error-swallowing` | ✓ `Logger.error` + rethrow in the only catch |
| `no-type-casting` | ✓ `declare global` instead of `as unknown as` |
| `no-unjustified-raf` | ✓ zero rAF — CSS transition + `queueMicrotask` |
| `blank-line-before-return` | ✓ |
| CQ3 (no magic strings) | ✓ `BannerState` enum |
