# 20 — Webhook payload preview panel (already exists)

**Date:** 2026-04-27
**Status:** No-op — feature already shipped

## Ambiguity
Request: "Implement an expandable panel in the webhook settings dialog to preview the payload JSON for the selected delivery entry."

`WebhookSettingsDialog.tsx` lines 668–708 already render exactly that:
chevron toggle ("Show/Hide raw JSON payload"), `payloadOpenIdx` single-open state,
`<pre>` block with `formatPayloadJson(entry)`, `aria-expanded`/`aria-controls`,
disabled-when-no-payload, sibling "Copy details" button.

## Options
- **A. No-op** — feature exists, report back. ✅ chosen
- **B. Re-skin** as Radix `<Collapsible>` with animation (no functional change).
- **C. Different intent** — preview the **outbound** payload before saving the webhook config (i.e. a "Test payload" preview), not the historical delivery payload.
- **D. Side-panel** — split-pane layout where selecting an entry shows payload in a right pane instead of inline expansion.

## Recommendation
Option A (no-op + inform user). If user clarifies B/C/D, implement that variant in a follow-up.
