/**
 * Spec: spec/21-app/01-chrome-extension/home-screen-modification/06-auto-focus-selected.md
 * Detection signal: presence of SelectionMarkerSvg only.
 */
import { resolveElement } from "./homepage-dashboard-variables";
import { logError, logWarn } from "./logger";
import { getSelected } from "./workspace-dictionary";
import type { WorkspaceDictionary } from "./types";

export function focusSelectedWorkspace(dict: WorkspaceDictionary): void {
    try {
        const selected = getSelected(dict);
        if (selected) {
            scrollWorkspaceIntoView(selected.fullXPath);
            return;
        }
        logWarn("focusSelected", "no selected workspace detected");
    } catch (caught) {
        logError("focusSelected", caught);
    }
}

function scrollWorkspaceIntoView(fullXPath: string): void {
    const el = resolveElement(fullXPath);
    if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
}
