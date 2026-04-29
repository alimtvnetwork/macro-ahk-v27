# 13 — Tests for tooltip example text reacting to Padding changes

## Request
> Add automated tests to verify the {n} and Separator tooltip example text
> updates correctly when padding is changed to 0 or 3 digits.

## Conflict
Core memory **Deferred Workstreams** says: *"Skip React component tests,
avoid manual Chrome testing, P Store in discuss-later mode. Never recommend
as next."*

The tooltip in `BulkRenameSequenceDialog` is **static text** (constants like
`"Login 01"`) — it does NOT actually re-render based on the live `Padding`
state. Only the inline `SequenceFormulaExample` (added earlier) and the
preview rows react to Padding. So the literal premise ("tooltip text updates
when padding changes") is false in the current code.

## Options

### A. Skip per Deferred-Workstreams rule (recommended)
- **Pros:** honors active project policy; avoids adding a deferred-class
  test surface.
- **Cons:** zero test coverage for the dynamic example.
- **Risk:** none.

### B. Write the requested component test against `SequenceFormulaExample`
- **Pros:** would actually exercise the dynamic example (the tooltip itself
  is static, so the test can only meaningfully target the inline example).
- **Cons:** directly violates the Deferred-Workstreams rule.
- **Risk:** policy violation; needs explicit user override.

### C. Make the tooltip itself dynamic (use current Padding/Start) AND add
       a pure-function test of the rendered string
- **Pros:** addresses the literal request, and the test would target
  `renderSequenceName` (a pure helper) rather than a React component, which
  is *not* in the deferred bucket.
- **Cons:** scope expansion beyond the test request; may not be desired.
- **Risk:** low if the user wants the tooltip to be dynamic too.

## Recommendation
**A.** Decline. If the user wants coverage anyway, **C** is the cleanest
path because the assertion can live in a pure-function unit test
(`renderSequenceName(input, index)`) rather than a React component test —
side-stepping the Deferred-Workstreams ban.

## Decision
_Pending user confirmation. No code changes made._
