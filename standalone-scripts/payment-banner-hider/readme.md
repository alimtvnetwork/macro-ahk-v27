# Payment Banner Hider — Standalone Script

**Version**: 2.230.0
**Author**: Riseup Asia LLC
**Type**: Global auto-injected userland script

## Purpose

Automatically hides the Lovable "Payment issue detected." sticky banner that
appears at `/html/body/div[2]/main/div/div[1]` on `lovable.dev/*` pages.

The banner is faded to black and collapsed within ~1 second using a pure
CSS3 transition declared in `css/payment-banner-hider.css`.

## Architecture (post-RCA refactor — Issue 98, 2026-04-24)

This script is the reference implementation of the standards in
`.lovable/memory/standards/`. Every file follows them by construction:

| Concern | File | Standard |
|---|---|---|
| Class entry point | `src/index.ts` → `class PaymentBannerHider` | `class-based-standalone-scripts` |
| Injected dependency | `src/banner-locator.ts` → `class BannerLocator` | `class-based-standalone-scripts` |
| State machine | `src/types.ts` → `enum BannerState` | CQ3 (no magic strings) |
| Styles on disk | `css/payment-banner-hider.css` | `standalone-scripts-css-in-own-file` |
| No `!important` | scoped `[data-marco-banner-hider]` selectors | `no-css-important` |
| Window typing | `src/globals.d.ts` (`declare global`) | `no-type-casting` |
| Catch handling | `Logger.error` + `throw caught` | `no-error-swallowing` |
| Animation | CSS transition + `queueMicrotask` (no rAF) | `no-unjustified-raf` |

## Behavior

| Stage | What happens |
|-------|---|
| 1 | Script auto-injects on `lovable.dev/*` (no manual run required). |
| 2 | `BannerLocator.locate()` runs the XPath and confirms the exact text. |
| 3 | If matched, the element gets `data-marco-banner-hider="fading"`. |
| 4 | A microtask later it transitions to `"hiding"` — opacity + max-height collapse over 900 ms. |
| 5 | After 1000 ms, `"done"` applies `display: none`. Layout space is released. |
| 6 | A `MutationObserver` watches for re-renders (React SPA navigation). |

## Build

```bash
npm run build:payment-banner-hider
```

Outputs to `standalone-scripts/payment-banner-hider/dist/`:
- `payment-banner-hider.js` — IIFE bundle, exposes `window.PaymentBannerHider`
- `payment-banner-hider.css` — copied from `css/` by `scripts/copy-payment-banner-hider-css.mjs`
- `instruction.json` — manifest consumed by the extension's seeder

## Debug API (`window.PaymentBannerHider`)

| Member | Description |
|--------|---|
| `version` | Library version string (matches repo unified version) |
| `check()` | Manually trigger one detection pass |

## Target URL Scope

`https://lovable.dev/*` — main app only. Preview iframes
(`*.lovable.app`, `*.lovableproject.com`) are excluded by design since the
billing banner only renders in the main app shell.
