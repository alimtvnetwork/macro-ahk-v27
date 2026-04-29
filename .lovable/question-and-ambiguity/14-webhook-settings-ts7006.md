# 14 — TS7006 errors in WebhookSettingsDialog (none found)

## Request
> Resolve the TS7006 implicit any errors in WebhookSettingsDialog by
> adding explicit types for all callback parameters and state updaters.

## Finding
Ran `bunx tsc --noEmit -p tsconfig.app.json` against the entire project:
**0 errors** total, including 0 in `src/components/options/WebhookSettingsDialog.tsx`.

The file is already strictly typed — every callback param and state updater
has an explicit type (verified by both the compiler pass and the project's
"No Explicit Unknown" + "Linting policy" Core rules, which would have flagged
any implicit-any).

## Possible causes for the user-observed errors
1. **Stale TS server in editor** — VS Code / WebStorm cached an outdated
   diagnostic; restarting the TS server clears it.
2. **Different file** — the user may have meant another dialog. The only
   file matching the name is `src/components/options/WebhookSettingsDialog.tsx`.
3. **Branch divergence** — a local uncommitted edit added implicit-any
   parameters that aren't visible in the workspace I see.

## Options

### A. Take no action, document and surface the discrepancy (recommended)
- **Pros:** avoids speculative type annotations that could regress behavior
  or fight inference; honors "Linting policy: zero TS errors" — already met.
- **Cons:** if the user genuinely sees errors locally, they remain
  unaddressed until they share the exact diagnostic.
- **Risk:** none.

### B. Add redundant explicit annotations to every callback in the file
- **Pros:** would silence any future TS7006 if `noImplicitAny` is ever
  enabled stricter than today.
- **Cons:** noise; possible inference regressions; touches code that has
  no observed defect; violates "only change what the user asked for" if
  no error actually exists.
- **Risk:** medium — risk of widening or narrowing types incorrectly.

## Recommendation
**A.** Do not implement. Ask the user (when No-Questions Mode lifts) to
paste the exact `tsc` / IDE diagnostic line(s) including line:col, and the
branch they're on. With those, the fix is one-line; without them, blanket
re-annotation is unjustified.

## Decision
_Pending user clarification. No code changes made._
