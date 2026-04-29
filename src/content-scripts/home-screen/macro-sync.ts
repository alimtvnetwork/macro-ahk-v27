/**
 * Spec: spec/21-app/01-chrome-extension/home-screen-modification/09-macro-controller-sync.md
 * CurrentWorkspaceName is the ONLY source of truth on dashboard.
 */
import { AllowedHomeUrl } from "./allowed-home-url.enum";
import { HomepageDashboardVariables, resolveElement } from "./homepage-dashboard-variables";
import { logError, logWarn } from "./logger";
import { findByName } from "./workspace-dictionary";
import type { WorkspaceDictionary, WorkspaceRecord } from "./types";

export function syncWithMacroController(dict: WorkspaceDictionary): WorkspaceRecord | null {
    try {
        if (!isOnDashboard()) {
            return null;
        }
        return doSync(dict);
    } catch (caught) {
        logError("syncMacro", caught);
        return null;
    }
}

function isOnDashboard(): boolean {
    return window.location.href === AllowedHomeUrl.DASHBOARD;
}

function doSync(dict: WorkspaceDictionary): WorkspaceRecord | null {
    const name = readCurrentWorkspaceName();
    if (!name) {
        logWarn("syncMacro", `CODE RED: CurrentWorkspaceName missing at ${HomepageDashboardVariables.CurrentWorkspaceName.full}`);
        return null;
    }
    const match = findByName(dict, name);
    if (!match) {
        logWarn("syncMacro", `name "${name}" not in dictionary`);
    }
    return match;
}

function readCurrentWorkspaceName(): string | null {
    const el = resolveElement(HomepageDashboardVariables.CurrentWorkspaceName.full);
    return el?.textContent?.trim() ?? null;
}
