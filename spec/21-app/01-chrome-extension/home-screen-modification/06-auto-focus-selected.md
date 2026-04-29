# 06 — Auto-Focus Selected Workspace

**Coding rules:** see file 10. DOM resolution wrapped in `try/catch`.

## Trigger

On every successful `buildWorkspaceDictionary()`:

1. Read `getSelected(dict)`.
2. If a record is returned, resolve its `fullXPath` to a live `Element`.
3. Call `scrollIntoView({ block: "center", behavior: "smooth" })`.

## Detection rule

A workspace item is "selected" when `SelectionMarkerSvg` is present inside it. This is the **only** signal — do not rely on class names, ARIA, or text styling.

## Function contract (≤ 8 lines)

```ts
export function focusSelectedWorkspace(dict: WorkspaceDictionary): void {
    try {
        const selected = getSelected(dict);
        if (selected) {
            scrollWorkspaceIntoView(selected.fullXPath);
        }
    } catch (caught) {
        RiseupAsiaMacroExt.Logger.error("HomeScreen.focusSelected", caught);
    }
}

function scrollWorkspaceIntoView(fullXPath: string): void {
    const el = resolveElement(fullXPath);
    if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
}
```

## Re-trigger rules

- On activation.
- After search bar clears (input becomes empty) and the selected item is again visible.
- NOT after Up/Down/Step click — that handler scrolls the new target itself.

## Acceptance

1. On activation with a selected workspace present, the item is scrolled to vertical center.
2. If no `SelectionMarkerSvg` is found in any item, no scroll happens and a `warn` log is emitted (not error).
3. Smooth-scroll behavior applied; no instant jump.
