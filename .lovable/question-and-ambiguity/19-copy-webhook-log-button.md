# 19 — "Copy log to clipboard" button on webhook delivery entries

**Date:** 2026-04-27
**Status:** Logged (No-Questions Mode active)

## Ambiguity
Request asks to add a "Copy log to clipboard" button next to each webhook
delivery entry that copies the formatted clipboard text. There is currently
**no webhook delivery list UI in the codebase** — `rg -l "webhook"` returns
nothing under `src/`. Webhook subsystem exists only in spec + memory
(`mem://features/webhook-result-schema-version`, `mem://constraints/webhook-fail-fast`).

## Options

### A. Build a new React `WebhookDeliveryLogPanel` from scratch with sample data
- **Pros:** Visible UI immediately; demonstrates copy-button pattern; reusable when real data lands.
- **Cons:** Sample/placeholder data isn't truthful; risk of duplicate UI when real list arrives; UI framework choice (React vs vanilla UIManager) ambiguous — `mem://architecture/ui-framework-selection` rejected React in macro-controller but Options page IS React.

### B. Build a reusable `<CopyLogButton entry={...} />` component (no list) so it drops into the future webhook list
- **Pros:** Solves the actual capability (formatting + copy + toast) without inventing fake data; one small focused file; trivially wired in when the list ships.
- **Cons:** No visible end-user change today.

### C. Extend the existing audit script to emit per-entry formatted text blocks
- **Pros:** Works today against real exported logs.
- **Cons:** Doesn't match "button next to each entry" — not a UI feature.

## Recommendation
**Option B.** Ship a reusable `CopyLogButton` (Lucide `Copy`/`Check` icon, dark-themed, uses `navigator.clipboard.writeText` with `document.execCommand` fallback) plus a pure `formatWebhookDeliveryLog(entry)` helper. Co-locate them under `src/components/webhook/` so the future delivery list just imports `<CopyLogButton entry={...} />`. Includes a unit test for the formatter (validator-aligned, redacts nothing — debug intent). Skips React component test per `mem://preferences/deferred-workstreams`.
