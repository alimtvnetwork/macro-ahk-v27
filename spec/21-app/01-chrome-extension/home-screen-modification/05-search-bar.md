# 05 — Search Bar

**Coding rules:** see file 10. All DOM mutation + handler attach in `try/catch`.

## Placement

Insert **directly after** the node resolved from `HomepageDashboardVariables.AllWorkspaceName`.

## Visual contract (hardcoded Tailwind class set — confirmed by user)

```ts
export const SearchBarClasses = {
    WRAPPER: "mt-2 mb-1 px-2",
    INPUT: "w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/30",
} as const;
```

Implementer may sample one sibling at runtime to verify class compatibility, but the hardcoded set above is the source of truth.

## DOM contract

```html
<div class="{WRAPPER}" data-marco-home="search-wrapper">
    <input
        type="text"
        class="{INPUT}"
        placeholder="Search workspaces…"
        data-marco-home="search-input"
        aria-label="Search workspaces"
    />
</div>
```

`data-marco-home` selectors are mandatory (per memory `selector-standards`) — no class-based queries.

## Behavior (functions ≤ 8 lines)

```ts
export function onSearchInput(value: string, dict: WorkspaceDictionary): WorkspaceRecord[] {
    const needle = value.trim().toLowerCase();
    if (needle === "") {
        return dict.byIndex;
    }
    return dict.byIndex.filter((r) => r.name.toLowerCase().includes(needle));
}

export function onSearchEnter(matches: WorkspaceRecord[]): void {
    const top = matches[0];
    if (top) {
        clickWorkspaceByXPath(top.fullXPath);
    }
}
```

## Filter rendering

- Show/hide list items by toggling `style.display` — do **not** remove from DOM (preserves React state).
- Filter on every `input` event, debounced 80 ms.

## Click contract

`clickWorkspaceByXPath(fullXPath)` resolves the element via `document.evaluate`, then dispatches a native `click` event. Wrapped in `try/catch`; logs CODE RED on resolution failure with exact XPath.

## Acceptance

1. Search bar renders directly after `AllWorkspaceName` with the hardcoded classes.
2. Typing filters the visible workspace items live.
3. Pressing Enter clicks the top match (replicates native click).
4. Empty input restores all items.
5. Search bar remains intact across MutationObserver-driven dictionary rebuilds (re-mount only if removed).
