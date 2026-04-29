# 04 — Workspace Dictionary (One-Pass Scrape)

**Coding rules:** see file 10. All scrape, lookup, and credit reads MUST be `try/catch` + `RiseupAsiaMacroExt.Logger.error`.

## Goal

Build the workspace dictionary **once** per activation. All downstream features (search, focus, Up/Down, credit append, sync) read from this dictionary. **No per-item DOM walks** in feature code.

## Record shape

```ts
export interface WorkspaceRecord {
    index: number;              // 1-based
    name: string;               // from WorkspaceItemText
    fullXPath: string;          // from WorkspaceItem with $ resolved
    proLabelXPath: string;      // resolved ProLabel XPath
    isSelected: boolean;        // SelectionMarkerSvg presence
    creditAvailable: number;    // from macro-controller logic
    creditTotal: number;        // from macro-controller logic
}

export interface WorkspaceDictionary {
    byName: Record<string, WorkspaceRecord>;
    byIndex: WorkspaceRecord[];   // index 0 = workspace 1, etc.
    selectedIndex: number | null; // -1 if none detected
}
```

## Build pipeline (each function ≤ 8 lines)

```ts
export async function buildWorkspaceDictionary(): Promise<WorkspaceDictionary> {
    try {
        const items = scrapeWorkspaceItems();
        const credits = await loadCreditMap();
        return assembleDictionary(items, credits);
    } catch (caught) {
        RiseupAsiaMacroExt.Logger.error("WorkspaceDictionary.build", caught);
        return emptyDictionary();
    }
}
```

### Steps

1. **Scrape** — Resolve `WorkspacesList`, iterate child `<div>` elements once. For each child build a partial record (`index`, `name`, `fullXPath`, `proLabelXPath`, `isSelected`).
2. **Credit map** — Call existing macro-controller credit fetch (see file 07) once. Returns `Map<workspaceName, { available, total }>`.
3. **Assemble** — Merge partial records with credit map by `name`. Missing credit entries default to `0 / 0` and are logged at `warn` level (not error).
4. **Selected index** — Single pass to find the record where `isSelected === true`. Store on dictionary.

## Lookup helpers (each ≤ 8 lines)

```ts
export function findByName(dict: WorkspaceDictionary, name: string): WorkspaceRecord | null {
    return dict.byName[name] ?? null;
}

export function findByIndex(dict: WorkspaceDictionary, oneBasedIndex: number): WorkspaceRecord | null {
    return dict.byIndex[oneBasedIndex - 1] ?? null;
}

export function getSelected(dict: WorkspaceDictionary): WorkspaceRecord | null {
    if (dict.selectedIndex === null) {
        return null;
    }
    return dict.byIndex[dict.selectedIndex] ?? null;
}
```

## Rebuild triggers

- On activation.
- After any UI mutation that adds/removes workspace items (observed via a single `MutationObserver` on `WorkspacesList`, debounced 200 ms).
- On credit refresh from macro controller.

## Error policy

- Any exception in `scrapeWorkspaceItems` → log via `Logger.error` with exact XPath that failed (per memory `file-path-error-logging-code-red`) and return `emptyDictionary()`.
- Missing `WorkspacesList` node → CODE RED log: include the resolved `full` XPath, what was missing (`element not found`), and reason (`document.evaluate returned null`).
