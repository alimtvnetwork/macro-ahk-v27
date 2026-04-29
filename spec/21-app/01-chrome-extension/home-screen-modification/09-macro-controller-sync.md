# 09 — Macro Controller Sync

**Coding rules:** see file 10. All cross-context reads in `try/catch`.

## Trigger

When the macro controller opens **and** the current URL is `AllowedHomeUrl.DASHBOARD`.

## Lookup pipeline (functions ≤ 8 lines)

```ts
export function syncWithMacroController(dict: WorkspaceDictionary): WorkspaceRecord | null {
    try {
        const name = readCurrentWorkspaceName();
        return name ? findByName(dict, name) : null;
    } catch (caught) {
        RiseupAsiaMacroExt.Logger.error("HomeScreen.syncMacro", caught);
        return null;
    }
}

function readCurrentWorkspaceName(): string | null {
    const xpath = HomepageDashboardVariables.CurrentWorkspaceName.full;
    const el = resolveElement(xpath);
    return el?.textContent?.trim() ?? null;
}
```

## Source of truth

- `CurrentWorkspaceName` XPath is the **only** source for the active workspace name on dashboard.
- Do not read from `chrome.storage`, do not infer from URL, do not parse the page title.

## Downstream actions

The matched `WorkspaceRecord` is passed to:

1. `focusSelectedWorkspace` — to re-center the list.
2. `appendCreditToProLabel` — to refresh credit display.
3. Macro controller's existing workspace-binding logic (already implemented; reuse via `marco.workspace.setActive(record.name)` if exposed, otherwise via `clickWorkspaceByXPath(record.fullXPath)`).

## Failure modes

- `CurrentWorkspaceName` element missing → CODE RED log with exact XPath.
- Name resolved but no dictionary match → `warn` log; macro controller continues with its own state.

## Acceptance

1. On dashboard, opening the macro controller reads `CurrentWorkspaceName` once.
2. The name is looked up via `findByName`; the matched record drives focus + credit refresh.
3. On non-dashboard allowed URLs (`/`, no path), this sync does not run.
