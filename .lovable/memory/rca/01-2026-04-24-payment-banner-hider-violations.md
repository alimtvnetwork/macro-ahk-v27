---
name: Payment banner hider — coding guideline violation RCA (2026-04-24)
description: Why payment-banner-hider/src/index.ts violated 8 standards at once and the rule that prevents recurrence
type: constraint
---

# RCA — `payment-banner-hider/src/index.ts` (2026-04-24)

The single file `standalone-scripts/payment-banner-hider/src/index.ts` was written in one pass without consulting the standards index. It violated eight documented rules. Every rule already existed.

## The eight violations and why each happened

| # | Violation | Rule that existed | Why it happened |
|---|---|---|---|
| 1 | 16 × `!important` in inline `<style>` | `mem://standards/no-css-important` | Agent reached for `!important` to win against the page's existing banner styles instead of using a `data-*` scoping hook for specificity. |
| 2 | `catch { return null; }` in `getTargetNode()` | `mem://standards/no-error-swallowing` + `mem://standards/error-logging-via-namespace-logger` | Treating "node not found" and "XPath threw" as the same outcome (`null`). They are not — the second is a defect that should surface in diagnostics. |
| 3 | Inline `<style>` blob via `document.createElement("style")` | `mem://standards/standalone-scripts-css-in-own-file` | Sibling files (`macro-controller`, `xpath`) ship CSS as a real file referenced from `instruction.ts`. Neither sibling was opened before writing. |
| 4 | Free-function entry point — no `class` | `mem://standards/class-based-standalone-scripts` | Agent treated the script as "too small for a class." Standard says class-based regardless of size, so injection of test doubles is possible. |
| 5 | Magic strings `"fading"` / `"hiding"` / `"done"` for state | CQ3 in `mem://standards/code-quality-improvement` | State machine implemented directly with string literals instead of a `BannerState` enum. |
| 6 | `as unknown as { PaymentBannerHider: typeof … }` cast on `window` | `mem://standards/no-type-casting` + `mem://standards/unknown-usage-policy` | Used to silence `tsc` instead of declaring `interface Window` augmentation in `globals.d.ts`. |
| 7 | Multiple `return` statements with no preceding blank line | `mem://standards/blank-line-before-return` | Visual scan skipped; no ESLint rule yet enforces it. |
| 8 | `requestAnimationFrame` (double-nested) before applying a class change | (new — this RCA) | Cargo-culted from animation tutorials; not needed when CSS transition is declared on the target class. |

## Why all eight slipped through at once

**The standards index was not consulted before writing.** `mem://standards/pre-write-check` is the explicit precondition for new files. It was bypassed because the visible output looked small (~100 lines). The standards apply equally to small files. None of the four mandated pre-merge greps (`!important`, `\bas [A-Z]`, `<style`, `catch \{`) ran.

## The rule going forward

Before writing or rewriting any file under `standalone-scripts/`, `src/`, `chrome-extension/`, or `scripts/`, the agent MUST:

1. Read every standard in `.lovable/memory/standards/` whose name overlaps the change (search by keyword).
2. Read at least one sibling file in the target folder.
3. Restate in the response which standards apply and how the new file complies.
4. Run the four pre-merge greps before claiming the file is done: `!important`, `\bas [A-Z](?!const)`, `<style`, `catch \{`.

This is a hard precondition, not a courtesy. The pre-write-check standard already states it; this RCA confirms it must be enforced.

## New rules added by this RCA (also stored as standards)

1. **`requestAnimationFrame` is default-deny in standalone scripts.** Each occurrence requires a comment justifying why a CSS transition or single class toggle is insufficient. See `mem://standards/no-unjustified-raf`.
2. **Pre-merge greps are mandatory.** Listed in `mem://standards/pre-write-check` (point 4, added 2026-04-24).

## Cross-references

- Issue spec: `spec/22-app-issues/98-payment-banner-hider-violation-rca.md`
- Source file under refactor: `standalone-scripts/payment-banner-hider/src/index.ts`
- Plan entry: `.lovable/plan.md` → Pending — Next Up
