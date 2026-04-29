/**
 * Spec: spec/21-app/01-chrome-extension/home-screen-modification/03-homepage-dashboard-variables.md
 *
 * SCREEN-SCOPED: keys here MUST NOT collide with any other screen's config object.
 * Memory: `.lovable/memory/architecture/screen-scoped-variables-rule.md`.
 */
export const INDEX_TOKEN = "$";

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

export function resolveFullXPath(key: HomepageDashboardVariableKey, index?: number): string {
    const entry = HomepageDashboardVariables[key];
    return injectIndex(entry.full, index);
}

function injectIndex(template: string, index?: number): string {
    if (index === undefined) {
        return template;
    }
    return template.replace(INDEX_TOKEN, String(index));
}

export function resolveElement(xpath: string): Element | null {
    try {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue as Element | null;
    } catch {
        return null;
    }
}

export function clickWorkspaceByXPath(xpath: string): void {
    const el = resolveElement(xpath);
    if (el instanceof HTMLElement) {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    }
}
