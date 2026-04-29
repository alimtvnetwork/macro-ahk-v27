# 18 — Conditional Elements & Auto-Detect Branching

> Status: **Draft v1** (2026-04-26, Asia/Kuala_Lumpur)
> Owner: Macro Recorder
> Related: `06-xpath-capture-engine.md`, `09-step-persistence-and-replay.md`,
> `12-record-replay-e2e-contract.md`, `16-step-group-library.md`,
> `17-hover-highlighter-and-data-controllers.md`

This spec adds **conditional elements** to the recorder: a way to evaluate
compound boolean expressions (AND / OR / NOT) over selector predicates
(presence, visibility, text, attribute) and use the result to either **gate**
the next action or **branch** to another step.

It is a strict superset of the existing `WaitFor` gate — `WaitFor` becomes a
single-predicate, presence-only special case of a `Condition`.

---

## 1. Glossary

| Term | Meaning |
|------|---------|
| **Predicate** | An atomic check on a single selector (e.g. *"this element is visible AND its text contains 'Done'"*). |
| **Condition** | A boolean tree over predicates: `{ all: [...] }`, `{ any: [...] }`, `{ not: ... }`, or a leaf predicate. |
| **Gate** | Inline condition attached to an action step; the step waits up to `TimeoutMs` for the condition to become true before acting (or fails). |
| **Branch** | A condition that, after evaluation, routes execution to a named target step instead of falling through. |

---

## 2. Predicate shape

```ts
type SelectorKind = "Auto" | "XPath" | "Css";

type Matcher =
    | { Kind: "Exists" }
    | { Kind: "Visible" }
    | { Kind: "TextEquals";    Value: string; CaseSensitive?: boolean }
    | { Kind: "TextContains";  Value: string; CaseSensitive?: boolean }
    | { Kind: "TextRegex";     Pattern: string; Flags?: string }
    | { Kind: "AttrEquals";    Name: string; Value: string }
    | { Kind: "AttrContains";  Name: string; Value: string }
    | { Kind: "Count";         Op: "eq" | "gte" | "lte"; N: number };

interface Predicate {
    readonly Selector: string;
    readonly SelectorKind?: SelectorKind;   // default "Auto" (per wait-for rules)
    readonly Matcher: Matcher;
    readonly Negate?: boolean;              // cheap shortcut to wrap in NOT
}
```

### 2.1 `Visible` definition

`getBoundingClientRect()` returns non-zero width AND height,
AND `getComputedStyle(el).visibility !== "hidden"`,
AND `getComputedStyle(el).display !== "none"`.

### 2.2 `Count` semantics

`Count` evaluates `doc.querySelectorAll(selector).length` (CSS) or the result
length of `XPathResult.ORDERED_NODE_SNAPSHOT_TYPE` (XPath). All other matchers
operate on the FIRST match only — same as `wait-for-element.ts`.

---

## 3. Condition tree

```ts
type Condition =
    | Predicate
    | { readonly All: ReadonlyArray<Condition> }     // AND
    | { readonly Any: ReadonlyArray<Condition> }     // OR
    | { readonly Not: Condition };                    // NOT
```

**Truth table for empty groups** (deliberate, mirrors lodash/JS):

- `{ All: [] }` → `true` (vacuous truth)
- `{ Any: [] }` → `false`
- `{ Not: predicate }` → `!predicate`

Maximum nesting depth: **8** (validated at save time). Predicate count per
condition: **32**.

---

## 4. Where conditions live (data model)

### 4.1 Inline gate — on every action step

The existing `Step.WaitFor` field is **superseded** by `Step.Gate` (NULLable):

```ts
interface ConditionGate {
    readonly Condition: Condition;
    readonly TimeoutMs: number;          // hard ceiling
    readonly PollMs?: number;            // default 50
    readonly OnTimeout: "Fail" | "Skip"; // Fail = abort run; Skip = continue
}
```

Backwards compat: when a row's `WaitFor` is non-null and `Gate` is null, the
runner synthesises a single-`Exists` `Gate` from it. New rows write `Gate`
only.

Storage: `Step.GateJson TEXT NULL` (added in migration `004`).

### 4.2 Dedicated step kind — `Condition` (StepKindId = 8)

A step that does NOT actuate the page; it evaluates a condition and routes:

```ts
interface ConditionStepParams {
    readonly Condition: Condition;
    readonly TimeoutMs: number;          // 0 = evaluate once
    readonly PollMs?: number;
    readonly OnTrue:  RouteAction;
    readonly OnFalse: RouteAction;
}

type RouteAction =
    | { Kind: "Continue" }                            // fall through to next step
    | { Kind: "GoToLabel"; Label: string }            // jump to Step.Label
    | { Kind: "GoToStepId"; StepId: number }          // jump to Step.StepId
    | { Kind: "RunGroup";  StepGroupId: number }      // invoke group then continue
    | { Kind: "EndRun"; Outcome: "Pass" | "Fail" };
```

Schema additions (migration `004`):

```sql
ALTER TABLE Step ADD COLUMN GateJson TEXT NULL;
INSERT OR IGNORE INTO StepKind (StepKindId, Name) VALUES (8, 'Condition');
```

`StepKindId = 8` rows store `ConditionStepParams` in the existing
`ParamsJson` blob (and re-use `Label` for `GoToLabel` targets).

The CHECK on `Step` is updated:

```sql
CHECK (
    (StepKindId = 6 AND TargetStepGroupId IS NOT NULL)
    OR (StepKindId IN (1,2,3,4,5,8) AND TargetStepGroupId IS NULL)
)
```

### 4.3 Combined behavior

If a step has BOTH an inline `Gate` AND is `StepKindId = 8`:

1. Evaluate the inline gate first. If it times out and `OnTimeout = "Fail"`, fail.
   If `Skip`, continue **without** evaluating the routing condition (treat as
   `OnFalse → Continue`).
2. Otherwise evaluate the routing condition once and apply the route action.

---

## 5. Runner semantics

```text
for each step in plan:
    if step.Gate is set:
        outcome = waitForCondition(step.Gate.Condition, TimeoutMs, PollMs)
        if not outcome.Ok:
            if step.Gate.OnTimeout == "Fail": emit failure, abort
            else: skip this step's actuation
    if step.StepKindId == 8 (Condition):
        truthy = evaluateCondition(step.Params.Condition)  // poll up to TimeoutMs
        route = truthy ? step.Params.OnTrue : step.Params.OnFalse
        applyRoute(route, plan, cursor)
        continue
    actuateStep(step)  // existing Click / Type / Select / JsInline / Wait / RunGroup / HttpRequest
```

### 5.1 Routing safety

- `GoToLabel` / `GoToStepId` jumps within the same `StepGroup` only.
  Cross-group jumps must use `RunGroup`.
- A jump-counter per run is bumped on each route; if it exceeds
  `MAX_ROUTE_JUMPS = 256`, the run fails with `Reason = "RouteLoopDetected"`.
- `EndRun` is the only legal way to short-circuit.

---

## 6. Failure-diagnostic contract

Every condition timeout / route failure emits a structured report following
`mem://standards/verbose-logging-and-failure-diagnostics`:

| Field | Source |
|-------|--------|
| `Reason` | `"ConditionTimeout"` · `"InvalidSelector"` · `"RouteLoopDetected"` · `"InvalidRouteTarget"` |
| `ConditionSerialized` | The full tree, pretty-printed JSON. |
| `LastEvaluation` | Per-predicate true/false snapshot from the last poll tick. |
| `Selectors` / `XPath` | Concatenated from all leaf predicates. |
| `Vars` / `Row` | Active row (post-interpolation). |
| `LogTail` | Last 200 verbose lines. |

---

## 7. UI surface

- Step inspector panel gains a **Condition** sub-section with:
  - A tree editor (add Predicate · wrap in AND / OR / NOT · drag to reorder).
  - A live "Test now" button that runs `evaluateCondition` against the active
    tab and renders the per-predicate truth chips.
- New step kind appears in the toolbar's add-step menu as **"Condition (if/else)"**.

UI files (deferred to a follow-up pass):
- `src/components/recorder/ConditionTreeEditor.tsx`
- `src/components/recorder/ConditionStepPanel.tsx`

---

## 8. Files in this pass

| File | Purpose |
|------|---------|
| `src/background/recorder/condition-evaluator.ts` | Pure evaluator + types + `waitForCondition`. |
| `src/background/recorder/condition-step.ts` | `applyRoute`, route-loop guard, route validation. |
| `src/background/recorder/__tests__/condition-evaluator.test.ts` | Predicates, tree, polling, timeout. |
| `src/background/recorder/__tests__/condition-step.test.ts` | Routing, jump cap, invalid targets. |

---

## 9. Test matrix

| ID | Area | Assertion |
|----|------|-----------|
| C1 | Pred | `Exists` true on present element. |
| C2 | Pred | `Visible` false when `display:none`. |
| C3 | Pred | `TextContains` honours case-insensitive default. |
| C4 | Pred | `TextRegex` invalid pattern → `InvalidSelector`. |
| C5 | Pred | `AttrEquals` matches HTML attribute. |
| C6 | Pred | `Count.gte` returns true when N met. |
| T1 | Tree | `All:[]` is true; `Any:[]` is false. |
| T2 | Tree | `Not(Exists)` flips. |
| T3 | Tree | Nested `All` of `Any` short-circuits. |
| W1 | Wait | Polls until condition true within `TimeoutMs`. |
| W2 | Wait | Times out with structured `ConditionTimeout`. |
| R1 | Route | `GoToLabel` resolves within group. |
| R2 | Route | Unknown label → `InvalidRouteTarget`. |
| R3 | Route | 257 jumps → `RouteLoopDetected`. |

---

## 10. Migration order

1. `004` — `Step.GateJson` column + `StepKind` seed `(8,'Condition')` + relaxed CHECK.
2. Ship `condition-evaluator.ts` + `condition-step.ts` + tests.
3. Wire into `live-dom-replay.ts` — replace `WaitFor` branch with `Gate` and
   add `StepKindId = 8` execution arm.
4. Ship the tree-editor UI.
