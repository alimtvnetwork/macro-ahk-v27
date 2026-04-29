# RCA — Payment Banner Hider Quality Failures (2026-04-24)

**Severity**: 🔴 High (engineering trust)
**Author of failing code**: AI (Lovable agent)
**File**: `standalone-scripts/payment-banner-hider/src/index.ts`
**Reviewer feedback**: 2026-04-24 chat session

---

## 1. What was wrong

The reviewer enumerated the following defects in the file I produced:

| # | Defect | Why it's wrong |
|---|---|---|
| D1 | Used `!important` throughout the inline CSS string | Project policy bans `!important`; it defeats the cascade and prevents downstream overrides. |
| D2 | Inlined a `<style>` blob in TS instead of shipping a sibling `.css` file | All other standalone scripts (`macro-controller`, `xpath`) ship a CSS section / file — pattern was already established. |
| D3 | `try { … } catch { return null; }` — silent error swallowing | Project standard `error-logging-via-namespace-logger` requires `Logger.error()` in every catch and forbids returning a sentinel that hides failure. |
| D4 | No blank line before `return` statements | Existing formatting standard `formatting-and-logic` (CQ15) requires a blank line before any non-trivial `return`. |
| D5 | Used `requestAnimationFrame` to drive the hide animation | Unjustified — a CSS class toggle plus a `transition` covers it. Adds runtime complexity for zero benefit. |
| D6 | Hide implemented as a multi-phase JS state machine ("fading" → "hiding" → "done") | Same outcome can be achieved with a single `.is-hidden { display: none }` class plus a CSS `transition` on opacity. Reviewer: *"that's enough on all"*. |
| D7 | Top-level free functions instead of a `PaymentBannerHider` class | Reviewer: *"write code in terms of class, not just direct functions"* — every related function should be a method or be injected into the class. |
| D8 | Magic strings for events / states (`"fading"`, `"hidden"`, message names) | Should be enum members in the global `standalone-scripts/types/` folder. |
| D9 | Type casts (`as HTMLElement`, `as unknown as X`) used to satisfy the compiler | Reviewer: *"never use unknown as a cast or never do the casting"* — if a cast is needed, the global typing should expose the right type so the cast is unnecessary. |
| D10 | Did not consult the existing engineering standards before writing the file | Standards exist (`.lovable/memory/standards/`) but the agent skipped the pre-write check. |

## 2. Root causes (why I wrote bad code)

### RC-1 — Skipped the pre-write context check
Memory contains 30+ standards files. I did not read them before writing `index.ts`. Specifically `error-logging-via-namespace-logger.md`, `formatting-and-logic.md`, `standalone-scripts-development.md`, and `code-quality-enforcement.md` would have prevented D3, D4, D2, and D1 respectively.

### RC-2 — Pattern-matched against the wrong reference
I treated the file as a one-off "small script" and copy-shaped it from generic web tutorials (rAF + state machine + inline `<style>` + `!important`) instead of looking at the **existing sibling scripts** (`xpath`, `macro-controller`) that already establish the project's house style (external CSS, class entry point, namespace logger, enum-driven state).

### RC-3 — Treated `catch { return null }` as "defensive"
Confused defensive coding (which means *handle and report*) with error swallowing (which means *hide and lie*). The project's no-error-swallowing standard is explicit and existed in memory; I did not honour it.

### RC-4 — Reached for `requestAnimationFrame` reflexively
rAF is the right tool when JS must drive a per-frame computation. Hiding a banner is not that — CSS `transition` on `opacity` (paired with `display: none` after the transition ends) is the entire solution. I added complexity that the problem did not ask for.

### RC-5 — Bypassed enums because none existed *in this project's local scope*
Instead of adding enums to the shared `standalone-scripts/types/` folder (which already exists), I inlined string literals. The correct move is to extend the global types and import — which the v23 reviewer already requested in a prior session for the instruction shape.

### RC-6 — Used type casts instead of fixing the type
Every `as HTMLElement` is a smell. The right fix is to make the function that returns the element return the right type (e.g. typed `querySelectorBy<XPathEntry>()` from the global API), so callsites never need a cast.

## 3. Corrective actions

The following actions are recorded as memory rules so the same mistakes cannot happen again on any future file. Each rule names the standard and the precise prohibition.

| Rule file | Forbids |
|---|---|
| `mem://standards/pre-write-check` | Writing any new code without first reading the relevant `.lovable/memory/standards/` files **and** at least one sibling file in the same folder. |
| `mem://standards/no-css-important` | The substring `!important` in any CSS, LESS, or string literal that ends up in CSS. |
| `mem://standards/standalone-scripts-css-in-own-file` | Inline `<style>` blobs or CSS-in-JS in any standalone-scripts entry point. |
| `mem://standards/no-error-swallowing` | `catch { … }` blocks that return a sentinel without calling `Logger.error()` or rethrowing. |
| `mem://standards/blank-line-before-return` | Non-trivial `return` statements without a blank line above. |
| `mem://standards/class-based-standalone-scripts` | Standalone script entry points exporting top-level functions instead of a single default class. |
| `mem://standards/no-type-casting` | `as T`, `as unknown as T`, and `<T>x` casts in standalone scripts. Fix the upstream type instead. |

## 4. Process change

Going forward, before writing any file in `standalone-scripts/`, the agent must:

1. List `.lovable/memory/standards/` and read every standard whose name overlaps the change.
2. List the target folder and read at least one sibling file to inherit the local pattern.
3. Restate, in the response, which standards apply and how the new file complies — so the user can audit at a glance.
4. Only then write the file.

This RCA is referenced from the spec at `spec/21-app/01-chrome-extension/standalone-scripts-types/01-overview.md` §11–§17.
