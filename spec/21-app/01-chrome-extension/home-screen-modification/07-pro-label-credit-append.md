# 07 — Pro Label Credit Append

**Coding rules:** see file 10. Reuse macro-controller credit logic — **do not reimplement**.

## Reuse contract (confirmed by user)

- Source: `standalone-scripts/macro-controller/`
- Functions: `fetchLoopCredits` / `fetchLoopCreditsAsync` (see memory `credit-monitoring-system`).
- Types: `WorkspaceCredit`, `LoopCreditState` from `standalone-scripts/macro-controller/src/types/credit-types.ts`.

The home-screen feature MUST import from those modules; **duplicate credit math is forbidden**.

## Mapping

For each `WorkspaceCredit` returned:

```ts
export function toCreditPair(wc: WorkspaceCredit): { available: number; total: number } {
    return { available: wc.available, total: wc.totalCredits };
}
```

(`totalCredits` is the canonical "total" field per `credit-types.ts`.)

## DOM mutation

Append a span **after** the existing Pro label text node.

```ts
export const CreditAppendClasses = {
    SPAN: "ml-1 text-xs opacity-70",
} as const;

export const CreditAppendAttrs = {
    MARKER: "data-marco-home",
    MARKER_VALUE: "credit-append",
} as const;
```

```html
<span class="{SPAN}" data-marco-home="credit-append">{available} / {total}</span>
```

## Update function (≤ 8 lines)

```ts
export function appendCreditToProLabel(record: WorkspaceRecord): void {
    try {
        const proEl = resolveElement(record.proLabelXPath);
        if (proEl) {
            upsertCreditSpan(proEl, record.creditAvailable, record.creditTotal);
        }
    } catch (caught) {
        RiseupAsiaMacroExt.Logger.error("HomeScreen.appendCredit", caught);
    }
}
```

`upsertCreditSpan` either updates the existing `[data-marco-home="credit-append"]` child or creates a new one. Idempotent.

## Refresh policy

- Append once per dictionary build.
- On credit refresh from macro controller → rebuild dictionary → re-run append for every record.
- No polling. No timers. (Per memory `no-retry-policy`.)

## Acceptance

1. Every workspace with a known credit entry shows `available / total` after its Pro label.
2. Workspaces with missing credit data show no append (and emit a `warn` log naming the workspace).
3. Re-rendering by React does not duplicate the span (idempotent upsert).
4. No credit math is implemented in this feature — all values come from `WorkspaceCredit`.
