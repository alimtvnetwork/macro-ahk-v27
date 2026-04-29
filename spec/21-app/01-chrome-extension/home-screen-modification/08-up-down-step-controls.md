# 08 — Up / Down / Step Controls

**Coding rules:** see file 10. Handlers wrapped in `try/catch`.

## Placement

Insert **directly after** the node resolved from `HomepageDashboardVariables.LifetimeDeal`.

## Direction enum (no magic strings)

```ts
export enum NavDirection {
    UP = "up",
    DOWN = "down",
}
```

## DOM contract

```ts
export const NavControlClasses = {
    WRAPPER: "mt-1 flex items-center gap-1 px-2",
    BUTTON: "rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white hover:bg-white/10",
    INPUT: "w-12 rounded-md border border-white/10 bg-white/5 px-1 py-0.5 text-xs text-white text-center",
} as const;
```

```html
<div class="{WRAPPER}" data-marco-home="nav-controls">
    <button data-marco-home="nav-up"   aria-label="Previous workspace">▲</button>
    <button data-marco-home="nav-down" aria-label="Next workspace">▼</button>
    <input  data-marco-home="nav-step" type="number" min="1" value="1" aria-label="Step size" />
</div>
```

## Step resolution (≤ 8 lines)

```ts
export function readStep(): number {
    try {
        const el = document.querySelector<HTMLInputElement>(`[data-marco-home="nav-step"]`);
        const parsed = Number.parseInt(el?.value ?? "1", 10);
        return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
    } catch {
        return 1;
    }
}
```

## Target index (≤ 8 lines, no negative `if`)

```ts
export function computeTargetIndex(currentOneBased: number, total: number, dir: NavDirection, step: number): number {
    const delta = dir === NavDirection.UP ? -step : step;
    const next = currentOneBased + delta;
    if (next >= 1 && next <= total) {
        return next;
    }
    return clampToRange(next, total);
}
```

`clampToRange` returns `1` if below range, `total` if above.

## Click handler

```ts
export function onNavClick(dir: NavDirection, dict: WorkspaceDictionary): void {
    try {
        const current = getSelected(dict);
        if (current) {
            jumpFromCurrent(current, dir, dict);
        }
    } catch (caught) {
        RiseupAsiaMacroExt.Logger.error("HomeScreen.navClick", caught);
    }
}
```

`jumpFromCurrent` calls `computeTargetIndex` → `findByIndex` → `clickWorkspaceByXPath`.

## Acceptance

1. Controls render immediately after `LifetimeDeal`.
2. Up button with step=1 → selects previous workspace via native click.
3. Down button with step=1 → selects next workspace via native click.
4. Step=N + Up → jumps N items up (clamped to 1).
5. Step=N + Down → jumps N items down (clamped to total).
6. Invalid step input falls back to 1 silently.
7. All actions go through `clickWorkspaceByXPath` — no direct React state mutation.
