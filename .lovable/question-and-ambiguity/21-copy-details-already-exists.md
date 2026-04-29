# 21 — "Copy details" in expanded webhook row (already exists)

**Date:** 2026-04-27
**Status:** No-op — feature already shipped

## Ambiguity
Request: "Add a 'Copy details' action in the expanded webhook log row that copies the variant-specific error/skip reason/status text."

`WebhookSettingsDialog.tsx` line 856–863 already renders a `<Button variant="outline">Copy details</Button>` inside the expanded row, wired to `copyLogEntry(entry) → buildLogClipboardText(entry)`. As of the previous turn, `buildLogClipboardText` emits a `[SUCCESS]/[SKIPPED]/[FAILURE]` header + `─`×48 separators + the variant-specific block:
- Success → `Status: OK (HTTP {Status})`
- Skipped → `Status: Skipped\nSkip reason: {SkipReason}`
- Failure → `Status: Failed (HTTP {Status})\nError: {Error}`

## Options
- **A. No-op** — feature exists. ✅ chosen
- **B. Add a second, narrower "Copy reason only" button** that copies just the status line (no header, separators, payload, or metadata) for quick paste into chat/tickets.
- **C. Move "Copy details" into a context menu / row hover affordance** instead of inline.

## Recommendation
Option A. If user clarifies they want B (status-line-only copy) or C (different placement), implement that variant.
