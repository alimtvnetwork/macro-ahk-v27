---
name: No CSS !important
description: The token !important is forbidden in CSS, LESS, and any string literal that becomes CSS
type: constraint
---

The token `!important` MUST NOT appear in:

- `.css`, `.less`, `.scss` files
- string literals inside `.ts` / `.tsx` / `.js` / `.mjs` files that end up injected as CSS (`<style>`, `cssText`, `setAttribute("style", …)`, template literals passed to a CSS injector)

If a rule isn't winning the cascade, the correct fix is one of: increase selector specificity using a stable hook (`data-*` attribute, scoped class), inject the stylesheet later in document order, or move the rule into a more-scoped layer. Never `!important`.

**Why**: `!important` defeats the cascade, prevents downstream theming and overrides, and signals that selector design failed. 2026-04-24 banner-hider RCA — `!important` was sprayed across an inline style blob to win against page styles when the right fix was a scoped `data-marco-banner-hider` attribute.

**How to apply**: ESLint rule planned (Task 0.8 in `plan.md`). Until then, agent must grep the produced file for `!important` before claiming the change is complete.
