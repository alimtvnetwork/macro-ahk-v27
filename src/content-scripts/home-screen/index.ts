/**
 * Spec: spec/21-app/01-chrome-extension/home-screen-modification/01-overview.md
 * Mount/unmount orchestrator only — no business logic here.
 */
import { appendCreditsForAll } from "./credit-append";
import { focusSelectedWorkspace } from "./focus-selected";
import { HomepageDashboardVariables, resolveElement } from "./homepage-dashboard-variables";
import { logError } from "./logger";
import { mountNavControls } from "./nav-controls";
import { mountSearchBar } from "./search-bar";
import { syncWithMacroController } from "./macro-sync";
import { shouldActivateHomeScreen, watchSpaNavigation } from "./url-guard";
import { buildWorkspaceDictionary } from "./workspace-dictionary";
import type { WorkspaceDictionary } from "./types";

const REBUILD_DEBOUNCE_MS = 200;

interface MountState {
    dict: WorkspaceDictionary;
    teardowns: (() => void)[];
}

let state: MountState | null = null;

export function activateHomeScreen(): void {
    if (shouldActivateHomeScreen()) {
        void mountHomeScreenFeatures();
        return;
    }
    unmountHomeScreenFeatures();
}

export async function mountHomeScreenFeatures(): Promise<void> {
    if (state) {
        return;
    }
    try {
        state = await doMount();
    } catch (caught) {
        logError("mount", caught);
    }
}

async function doMount(): Promise<MountState> {
    const dict = await buildWorkspaceDictionary();
    const teardowns: (() => void)[] = [];
    teardowns.push(mountSearchBar(() => state?.dict ?? dict));
    teardowns.push(mountNavControls(() => state?.dict ?? dict));
    teardowns.push(installRebuildObserver());
    runPostBuild(dict);
    return { dict, teardowns };
}

function runPostBuild(dict: WorkspaceDictionary): void {
    appendCreditsForAll(dict.byIndex);
    focusSelectedWorkspace(dict);
    syncWithMacroController(dict);
}

function installRebuildObserver(): () => void {
    const list = resolveElement(HomepageDashboardVariables.WorkspacesList.full);
    if (!list) {
        return () => undefined;
    }
    let timer: number | null = null;
    const obs = new MutationObserver(() => scheduleRebuild(timer, (t) => { timer = t; }));
    obs.observe(list, { childList: true, subtree: false });
    return () => obs.disconnect();
}

function scheduleRebuild(existing: number | null, setTimer: (t: number) => void): void {
    if (existing !== null) window.clearTimeout(existing);
    setTimer(window.setTimeout(rebuild, REBUILD_DEBOUNCE_MS));
}

async function rebuild(): Promise<void> {
    if (!state) return;
    const dict = await buildWorkspaceDictionary();
    state.dict = dict;
    runPostBuild(dict);
}

export function unmountHomeScreenFeatures(): void {
    if (!state) return;
    for (const fn of state.teardowns) {
        try { fn(); } catch (caught) { logError("unmount", caught); }
    }
    state = null;
}

export function bootHomeScreen(): () => void {
    activateHomeScreen();
    return watchSpaNavigation(activateHomeScreen);
}
