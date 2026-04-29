# 19 — URL-Based Tab Clicks, Element-Appearance Waits, and Conditional Element Rules

> Status: **Draft v1** (2026-04-26, Asia/Kuala_Lumpur)
> Owner: Macro Recorder
> Related: `06-xpath-capture-engine.md`, `09-step-persistence-and-replay.md`,
> `12-record-replay-e2e-contract.md`, `16-step-group-library.md`,
> `17-hover-highlighter-and-data-controllers.md`,
> `18-conditional-elements.md`

This spec consolidates and formalises three behaviours the recorder must
support across capture, persistence, and replay:

1. **URL-based tab clicks** — clicks that open or focus a tab whose URL
   matches a declared pattern, instead of (or in addition to) targeting a
   page element.
2. **Element-appearance waiting** — the canonical contract for "wait until
   X is on the page" used by both the inline `Gate` (spec 18) and the
   legacy `WaitFor` field (spec 09).
3. **XPath/CSS conditional element rules** — the dialect, precedence, and
   diagnostic shape every condition predicate MUST follow.

Each section ends with **Acceptance Criteria** suitable for the
`97-acceptance-criteria.md` rollup and the LLM authoring guide.

---

## 1. URL-Based Tab Clicks

### 1.1 Motivation

A click step today resolves a target on the **current** page. Real
recordings often do one of:

- Click a link that opens a new tab (`target="_blank"` or
  `window.open()`).
- Re-focus a previously opened tab whose URL is known but whose tab id
  is not.
- Open a brand new tab to a URL the recorder controls (no element
  involved at all).

The recorder MUST be able to capture and replay all three from the same
step row.

### 1.2 New step kind — `UrlTabClick` (`StepKindId = 9`)

Schema delta (migration `005`):

```sql
INSERT OR IGNORE INTO StepKind (StepKindId, Name) VALUES (9, 'UrlTabClick');
```

`Step.ParamsJson` for this kind:

```ts
interface UrlTabClickParams {
    /** Pattern that must match the resulting tab URL after the click. */
    readonly UrlPattern: string;
    /** Pattern dialect — see §1.3. */
    readonly UrlMatch: "Exact" | "Prefix" | "Glob" | "Regex";
    /** What to do when the click resolves. */
    readonly Mode: "OpenNew" | "FocusExisting" | "OpenOrFocus";
    /**
     * Optional element selector — when set, the click is dispatched on
     * this element and its post-click navigation must satisfy `UrlPattern`.
     * When absent, the runner opens the URL directly via
     * `chrome.tabs.create({ url })`.
     */
    readonly Selector?: string;
    readonly SelectorKind?: "Auto" | "XPath" | "Css";
    /** Hard ceiling waiting for the tab/URL to settle. Default 15_000. */
    readonly TimeoutMs?: number;
    /**
     * If true and `Mode = "OpenNew"`, a literal `Url` is required and
     * `Selector` is ignored. Useful for project bootstraps.
     */
    readonly DirectOpen?: boolean;
    /** Required when `DirectOpen = true`. */
    readonly Url?: string;
}
```

Backwards compat: a normal `Click` step (`StepKindId = 1`) that
historically opened a new tab is **not** auto-migrated. New recordings
use `UrlTabClick` when the capture engine detects a navigating click
(see §1.4).

### 1.3 URL pattern dialect

| Dialect | Match rule | Example |
|---------|-----------|---------|
| `Exact` | `tabUrl === pattern` after stripping trailing `/`. | `https://app.example.com/orders` |
| `Prefix` | `tabUrl.startsWith(pattern)`. | `https://app.example.com/orders/` |
| `Glob` | `*` matches any run of non-`/` chars; `**` matches any chars including `/`. | `https://app.example.com/orders/*/edit` |
| `Regex` | `new RegExp(pattern).test(tabUrl)`. Anchors are caller's responsibility. | `^https://app\\.example\\.com/orders/\\d+$` |

Comparison is **case-sensitive** for path/query, **case-insensitive**
for scheme + host. Invalid `Regex` → structured failure
`Reason = "InvalidUrlPattern"`.

### 1.4 Capture-time detection

`capture-step-recorder.ts` records the click as `UrlTabClick` instead
of `Click` when ANY of the following hold:

1. The element is an `<a>` whose `target === "_blank"`.
2. The element is an `<a>` whose `href` resolves to a different
   origin than `location.origin`.
3. The click handler synchronously calls `window.open()` (detected via
   the existing capture proxy on `window.open`).
4. A `tabs.onCreated` event fires within `200ms` of the captured click
   (background script bridge — see `13-capture-to-step-bridge.md`).

The recorded `UrlPattern` defaults to `Glob` derived from the resolved
URL: numeric path segments → `*`, UUIDs → `*`, query string dropped.
The user can override this in the step inspector.

### 1.5 Replay semantics

Pseudocode for `executeUrlTabClick(step, ctx)`:

```text
target := empty
if Mode in ("FocusExisting", "OpenOrFocus"):
    target := chrome.tabs.query({ url: globToMatchPattern(UrlPattern) })[0]
    if target is set:
        chrome.tabs.update(target.id, { active: true })
        wait until target.url matches UrlPattern (poll 50ms, ceiling TimeoutMs)
        return Ok
    if Mode == "FocusExisting": fail with TabNotFound

# At this point we need to open a new tab.
if DirectOpen == true:
    chrome.tabs.create({ url: Url })
else:
    dispatchClick(resolved(Selector))   # may itself open a tab
wait for chrome.tabs.onUpdated where new tab.url matches UrlPattern
    (poll-equivalent, ceiling TimeoutMs)
focus the new tab and bind it to ctx.activeTabId
return Ok
```

Failure reasons (mandatory in failure report):
`UrlTabClickTimeout` · `TabNotFound` · `InvalidUrlPattern` ·
`SelectorNotFound` · `UrlPatternMismatch` (a tab opened but its URL
never matched).

### 1.6 Acceptance Criteria — URL Tab Clicks

- **AC-19.1.1** Capturing a click on `<a target="_blank" href="…">`
  records a `UrlTabClick` step with `Mode = "OpenNew"` and a derived
  `Glob` pattern.
- **AC-19.1.2** Capturing a click that triggers `window.open(url)`
  records a `UrlTabClick` step whose `UrlPattern` matches `url`.
- **AC-19.1.3** Replaying `Mode = "FocusExisting"` against a workspace
  with a matching tab focuses it without opening a new one and
  resolves within `TimeoutMs`.
- **AC-19.1.4** Replaying `Mode = "FocusExisting"` against a workspace
  with no matching tab fails with `Reason = "TabNotFound"` (no tab
  is ever created).
- **AC-19.1.5** Replaying `Mode = "OpenOrFocus"` opens a new tab when
  none matches and reuses an existing one when one does.
- **AC-19.1.6** Replaying `DirectOpen = true` with `Url` empty fails
  with `Reason = "InvalidUrlPattern"` (validated client-side at save).
- **AC-19.1.7** A `Regex` pattern that throws on `new RegExp` is
  rejected at save time with `Reason = "InvalidUrlPattern"`.
- **AC-19.1.8** When the new tab opens but its final URL never matches
  the pattern within `TimeoutMs`, the step fails with
  `Reason = "UrlPatternMismatch"` and the failure report includes the
  observed URL and the pattern.
- **AC-19.1.9** Pattern matching is case-sensitive for path and query
  but case-insensitive for scheme + host.
- **AC-19.1.10** `executeUrlTabClick` rebinds the runner's
  `ctx.activeTabId` to the resolved tab so subsequent steps target it.

---

## 2. Element-Appearance Waiting

### 2.1 Single canonical contract

All three places that wait for an element MUST use the same primitive:

| Source | How it waits |
|--------|--------------|
| `Step.Gate` (spec 18 §4.1) | `waitForCondition(Gate.Condition, …)` |
| `Step.WaitFor` (legacy spec 09) | Synthesised as `Gate = { Condition: { Selector, Matcher: { Kind: "Exists" } } }`. |
| Implicit settle after Click/Type/Select | Optional, off by default; when on uses `waitForCondition` with `{ All: [Visible(target)] }`. |

`waitForCondition` is the pure poll loop in
`src/background/recorder/condition-evaluator.ts`. It is the **only**
sanctioned way to poll for element appearance in the recorder.

### 2.2 Mandatory parameters

Every appearance wait MUST declare:

- `TimeoutMs` (no implicit default — every call site supplies one).
- `PollMs` (default `50`, minimum `1`, max `5_000`).
- `OnTimeout` ∈ `{ "Fail", "Skip" }` (only legal when wait is attached
  to an action step's `Gate`; standalone Condition steps route via
  `OnFalse` instead).

### 2.3 What counts as "appeared"

Default predicate is `Visible` (see condition-evaluator §2.1 — non-zero
rect AND `display !== "none"` AND `visibility !== "hidden"`). Authors
who only need DOM presence MUST opt down to `Exists` explicitly so the
intent is reviewable.

### 2.4 Acceptance Criteria — Element-Appearance Waiting

- **AC-19.2.1** A step with `Gate = { Condition: Visible(sel),
  TimeoutMs: 2000, PollMs: 50, OnTimeout: "Fail" }` waits up to 2 s
  for the selector to render visibly before actuating.
- **AC-19.2.2** `OnTimeout = "Fail"` produces a failure report with
  `Reason = "ConditionTimeout"`, the serialized condition, and the
  last per-predicate evaluation trace.
- **AC-19.2.3** `OnTimeout = "Skip"` skips the step's actuation and
  emits a `Skipped` step record (status = legacy `Disabled` is NOT
  reused — a new `StepRunStatusId = "Skipped"` is added).
- **AC-19.2.4** A `WaitFor`-only legacy row is read by the runner as
  `Gate = { Condition: Exists(WaitFor.Expression),
  TimeoutMs: WaitFor.TimeoutMs, OnTimeout: "Fail" }` with no
  user-visible diff.
- **AC-19.2.5** `PollMs < 1` is rejected at save time;
  `PollMs > 5000` is clamped to 5000 with a warning toast.
- **AC-19.2.6** The waiter polls at least twice before timing out
  (i.e. a `0ms` deadline still evaluates once).
- **AC-19.2.7** When the wait succeeds, the failure report module
  records `WaitMs = result.DurationMs` and `Polls = result.Polls`
  for diagnostics.

---

## 3. XPath / CSS Conditional Element Rules

### 3.1 Selector dialect & auto-detection

`SelectorKind` ∈ `{ "Auto", "XPath", "Css" }`. When `Auto`:

- A trimmed expression starting with `/` or `(` → **XPath**.
- Anything else → **CSS**.

XPath evaluation MUST use `XPathResult.FIRST_ORDERED_NODE_TYPE` for
`first match` matchers and `XPathResult.ORDERED_NODE_SNAPSHOT_TYPE`
for `Count`. CSS evaluation uses `querySelector` /
`querySelectorAll`. No third dialect is permitted.

### 3.2 Predicate scope (recap of spec 18)

`Exists`, `Visible`, `TextEquals`, `TextContains`, `TextRegex`,
`AttrEquals`, `AttrContains`, `Count`. All operate on the **first**
element returned by the selector except `Count`, which counts the
full snapshot. `Negate` flips the result of the matcher only — it
does not promote the predicate to a full `Not` node.

### 3.3 Compound rules

- `All:[]` is `true` (vacuous truth).
- `Any:[]` is `false`.
- `Not(x)` is `!x`.
- Maximum nesting depth: **8**. Validated at save time
  (`validateCondition`).
- Maximum predicate count per condition tree: **32**.

### 3.4 Diagnostic shape

Every failed condition MUST emit a structured failure record with at
least these fields:

```ts
interface ConditionFailureRecord {
    readonly Reason:
        | "ConditionTimeout"
        | "InvalidSelector"
        | "InvalidUrlPattern"
        | "RouteLoopDetected"
        | "InvalidRouteTarget";
    readonly ConditionSerialized: string;            // pretty JSON
    readonly LastEvaluation: ReadonlyArray<{
        readonly Selector: string;
        readonly Kind: "XPath" | "Css";
        readonly Matcher: string;
        readonly Result: boolean;
        readonly Detail?: string;
    }>;
    readonly Selectors: ReadonlyArray<string>;       // flattened leaves
    readonly XPath: ReadonlyArray<string>;           // subset of Selectors
    readonly Vars: Record<string, string>;
    readonly Row: Record<string, string>;
    readonly LogTail: ReadonlyArray<string>;         // last ≤200 lines
}
```

This is the **same shape** required by
`mem://standards/verbose-logging-and-failure-diagnostics`.

### 3.5 Save-time validation rules

`validateCondition` MUST reject (with structured error, not a thrown
crash):

1. Tree depth `> MAX_CONDITION_DEPTH (8)`.
2. Predicate count `> MAX_PREDICATE_COUNT (32)`.
3. `TextRegex` patterns that throw on `new RegExp(Pattern, Flags)`.
4. `AttrEquals` / `AttrContains` with empty `Name`.
5. `Count` with `N < 0`.

Every error MUST surface to the UI with the exact predicate path
(e.g. `All[1].Any[0].TextRegex`) so the editor can highlight the bad
node.

### 3.6 Performance guards

- Polling loops MUST honour `MIN_POLL_MS = 1` and `MAX_POLL_MS = 5000`.
- A single `evaluateCondition` call MUST short-circuit `All` / `Any`
  evaluation (already implemented).
- Condition trees are evaluated **synchronously** within a single
  poll tick — no awaits inside the tree walker.

### 3.7 Acceptance Criteria — XPath/CSS Conditional Rules

- **AC-19.3.1** A leaf predicate with no `SelectorKind` and a selector
  starting with `/html/body/...` is evaluated as XPath.
- **AC-19.3.2** A leaf predicate with no `SelectorKind` and a selector
  starting with `#submit` is evaluated as CSS.
- **AC-19.3.3** `Visible` returns false for a `display:none` element
  even when `Exists` would return true.
- **AC-19.3.4** `Count.gte` against a snapshot of `N` elements
  returns true when `N ≥ Matcher.N` and false otherwise.
- **AC-19.3.5** `All:[]` evaluates to `true`; `Any:[]` evaluates to
  `false`; `Not(true)` evaluates to `false`.
- **AC-19.3.6** A condition tree of depth 9 is rejected at save with a
  structured `InvalidSelector` error pointing at the deepest node.
- **AC-19.3.7** A `TextRegex` predicate with `Pattern = "(unclosed"` is
  rejected at save with `Reason = "InvalidSelector"` and the bad
  pattern echoed in the error detail.
- **AC-19.3.8** A failed `waitForCondition` returns
  `{ Ok: false, Reason: "ConditionTimeout" }` with a non-empty
  `LastEvaluation` array — never an empty trace.
- **AC-19.3.9** `evaluateCondition` invoked with a `Trace[]` argument
  appends one entry per leaf predicate visited in evaluation order.
- **AC-19.3.10** The runner refuses to persist a step whose `Gate`
  fails `validateCondition`; the rejection is reported at the step
  inspector save point, not at replay time.

---

## 4. Cross-cutting telemetry

For every URL/wait/condition path the runner emits a single
`recorder.step.diagnostic` event with:

- `StepId`, `StepKindId`, `RunId`
- `Outcome` ∈ `{ "Ok", "Failed", "Skipped" }`
- `WaitMs`, `Polls`, `RouteJumps`
- The full `ConditionFailureRecord` (only on failure)

This surfaces in the **Failure Reports** panel exactly the way
existing failures do, so the export-as-JSON / pretty-print workflow
already shipped (FailureReportsPanel) reuses no new plumbing.

---

## 5. Migration order

1. Schema migration `005` — `StepKind (9, 'UrlTabClick')`.
2. Code: extend `condition-evaluator.ts` failure shape to match §3.4
   (already largely there — only field renames if any).
3. Code: implement `executeUrlTabClick.ts` + capture-time detection in
   `capture-step-recorder.ts`.
4. UI: step inspector gains a `UrlTabClick` editor (URL, mode, pattern
   dialect, optional selector).
5. Spec rollups: append §1, §2, §3 acceptance criteria into
   `97-acceptance-criteria.md` and the `llm-guide.md` cookbook.

---

## 6. Out of scope

- Cross-window navigation tracking (only `chrome.tabs.*`, no
  `chrome.windows.*` in this pass).
- Service-worker / SPA history-API navigations that occur **without**
  a click (covered in a later "ImplicitNavigation" spec).
- Re-using an existing tab whose URL matches but whose origin differs
  due to OAuth redirects (treated as "no match" for safety).
