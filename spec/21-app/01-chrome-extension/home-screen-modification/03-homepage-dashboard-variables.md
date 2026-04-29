# 03 — HomepageDashboardVariables (XPath Config)

**Coding rules:** file ≤ 100 lines, function ≤ 8 lines, enums first, no magic strings, all I/O wrapped in `try/catch`. See file 10.

## STRICT screen-isolation rule

This config is scoped to the home / dashboard screen. **No key here may collide with any other screen's config.** Persisted to memory: `.lovable/memory/architecture/screen-scoped-variables-rule.md`.

## XPath storage rule

Every entry stores **both**:

- `full` — absolute XPath from `/html/...`.
- `relative` — relative path from a named `parentRef`.

Runtime resolution combines `parentRef.full` + `relative` to produce the live full path. List-item indexes (`$`) are 1-based and resolved at lookup time.

## Config (single grouped object — implement as TS const + `as const`)

```ts
export const HomepageDashboardVariables = {
    WorkspacesList: {
        full: "/html/body/div[4]/div/div[6]/div/div[1]",
        relative: "",
        parentRef: null,
    },
    WorkspaceItem: {
        full: "/html/body/div[4]/div/div[6]/div/div[1]/div[$]",
        relative: "div[$]",
        parentRef: "WorkspacesList",
    },
    ProLabel: {
        full: "/html/body/div[4]/div/div[6]/div/div[1]/div[$]/div/span",
        relative: "div/span",
        parentRef: "WorkspaceItem",
    },
    WorkspaceItemText: {
        full: "/html/body/div[4]/div/div[6]/div/div[1]/div[$]/div/p",
        relative: "div/p",
        parentRef: "WorkspaceItem",
    },
    SelectionMarkerSvg: {
        full: "/html/body/div[4]/div/div[6]/div/div[1]/div[$]/div/svg",
        relative: "div/svg",
        parentRef: "WorkspaceItem",
    },
    AllWorkspaceName: {
        full: "/html/body/div[4]/div/div[6]/div/p",
        relative: "",
        parentRef: null,
    },
    CurrentWorkspaceName: {
        full: "/html/body/div[2]/div[1]/div[2]/aside/div/div[2]/button/span/span[2]",
        relative: "",
        parentRef: null,
    },
    LifetimeDeal: {
        full: "/html/body/div[4]/div/div[1]/div[2]/p[2]",
        relative: "",
        parentRef: null,
    },
} as const;

export type HomepageDashboardVariableKey = keyof typeof HomepageDashboardVariables;
```

## Resolver contract (≤ 8-line functions)

```ts
export function resolveFullXPath(key: HomepageDashboardVariableKey, index?: number): string {
    const entry = HomepageDashboardVariables[key];
    return injectIndex(entry.full, index);
}

function injectIndex(template: string, index?: number): string {
    if (index === undefined) {
        return template;
    }
    return template.replace("$", String(index));
}
```

## Index-token policy

- The `$` placeholder is the **only** allowed index token. No magic strings — exported as `INDEX_TOKEN = "$"` constant in the module.
- Functions resolving a list-item XPath MUST require an index argument.

## Disambiguation note

The original input reused key `h` for both `WorkspaceItemText` and `LifetimeDeal`. They are split into distinct keys above. Treat the two as completely separate entries.
