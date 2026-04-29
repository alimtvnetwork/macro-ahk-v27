# 07 — Post-Step Wait-For-Selector Condition

**Task**: "Implement a selector-based condition that the recorder
waits for after each step, supporting both XPath and CSS (with
auto-detection)."

## Ambiguity

1. **Granularity** — per step, per group, or global?
2. **Match condition** — "any element exists", "is visible", "is
   detached / removed", "specific count"?
3. **What counts as XPath vs CSS** — both languages overlap on simple
   prefixes (`/html/body` is unambiguous, but `body > div` is CSS-only,
   `div` is valid in both).
4. **Where does the wait actually run** — the step-library runner is
   pure (no DOM); the real wait must happen inside the recorder's
   leaf executor in the background worker.

## Inferred decisions

| Axis | Decision | Reason |
|------|----------|--------|
| Granularity | Per step (`StepId`-keyed) | Matches the literal "after each step" language; lets the user opt-in only where needed |
| Match condition | `"Appears"` (default), `"Disappears"`, `"Visible"`. Each picks the predicate inside the executor | Covers the three scenarios that motivate post-step waits (loaded element, dismissed spinner, rendered modal) |
| Auto-detection | Heuristic that strictly favours XPath only when it starts with `/`, `(/`, `(./`, or `./` (or contains the unambiguous `//`). Otherwise CSS. User can override via explicit kind | Mirrors how every major framework auto-detects (Playwright, Selenium WebDriverWait) and avoids tag-only ambiguity |
| Validation | Pure module compiles CSS via `document.querySelector` (no-op call wrapped in try) and XPath via `document.evaluate` syntax check. In tests, the same parser uses regex-based shape validation since jsdom may not have full XPath support | Failing fast with a friendly message at save time beats failing mid-run |
| Where the wait runs | The pure module exposes `waitForSelector({ selector, kind, condition, timeoutMs, root })` that does the polling loop; the recorder's executor invokes it after each step via the persisted config | Clean seam — pure module is unit-testable with a stub document |
| Storage | `localStorage` key `marco.step-library.wait.v1`, shape `{ [StepId]: WaitConfig }` | Mirrors the sibling `group-inputs.ts` / `result-webhook.ts` convention |
| Default timeout | 5 000 ms, clamped 250–60 000 | Long enough for typical SPA transitions, short enough to fail loudly on broken selectors |

## Reversibility

Future tasks can:
- Promote storage to a sql.js column on `Step` once the schema bumps.
- Add per-group wait defaults + per-step overrides.
- Expose extra conditions (`Stable`, `Count >=`, `Text matches`) by extending the `Condition` enum without breaking persisted rows.

## Addendum — "Test selector" UI control (2026-04-26)

Added a **Test selector** button inside `StepWaitDialog` that runs
`evaluateSelector` against the live options-page `document` and reports
`{TotalCount, VisibleCount, DurationMs}` (or the compile error). Result
state is invalidated whenever the selector text or kind changes so the
chip can never go stale.

Caveat surfaced in the dialog: the probe runs against the page hosting
the options UI, **not** the recorder's target tab. It still catches the
overwhelming majority of authoring mistakes (typos, malformed brackets,
wrong axis, accidental `//` prefix on a CSS expression). Promoting the
probe to the recorder's active tab would require a background message
round-trip and is left for a follow-up task.


## Addendum — Runner bridge (2026-04-26)

Bridged the persisted `WaitConfig` (storage layer + dialog UI) into the
existing `live-dom-replay.executeStep` path. After Click/Type/Select
dispatches, the executor now resolves the effective wait gate as:

1. Inline `step.WaitFor` (programmatic / advanced callers) — wins.
2. `readStepWait(step.StepId)` → `persistedWaitToSpec(...)` — UI path.
3. Otherwise no wait.

Both routes feed the same `waitForElement` helper, so failure messaging
is consistent (`WaitFor '<expr>' did not appear within <ms>ms ...`).

`waitForElement` only implements the `Appears` predicate today;
`Disappears` and `Visible` configs from the dialog fall back to
`Appears` with a `console.warn` so the discrepancy is traceable until
that helper is extended.

Coverage: 4 new tests in `live-dom-replay.test.ts` — pause-then-pass,
pause-then-timeout, inline-WaitFor wins, no-config no-op. Suite total
201/201.

## Addendum — Structured failure report (2026-04-26)

Wait-gate failures now emit a fully structured `FailureReport` so the
existing `FailureDetailsPanel` / `failure-toast` UI can render them
without any UI-side changes:

| Field | Value |
|-------|-------|
| `Reason` | `"Timeout"` for budget exhaustion, `"XPathSyntaxError"` / `"CssSyntaxError"` for compile errors |
| `ReasonDetail` | `WaitFor selector '<expr>' (Kind=<Css|XPath>) did not appear within <configured> ms (elapsed <actual> ms).` |
| `Message` | Same string as `ReasonDetail` (also surfaces in `ReplayStepResult.Error`) |
| `StepKind` | The actuating step kind (Click / Type / Select) |
| `StepId` / `Index` | Locate the step in the project's Step list |

The four user-requested fields — **selector**, **kind**, **configured
timeout**, **elapsed time** — all appear in `ReasonDetail`, which the
existing `ReasonBanner` renders prominently above the selector
attempts. No new component needed; the panel's `GROUP_TONE["timeout"]`
already paints the banner amber.

`finalize()` in `live-dom-replay.ts` gained two optional fields
(`Reason`, `ReasonDetail`) so any future post-action gate can reuse
the same plumbing without re-classifying via the auto-derivation in
`logFailure`.

Coverage: 2 new tests assert the message text, the `Reason` code, and
the `ReasonDetail` shape for both Timeout and CssSyntaxError paths.
Suite total 221/221.
