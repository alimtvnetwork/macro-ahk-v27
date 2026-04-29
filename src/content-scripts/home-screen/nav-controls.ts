/**
 * Spec: spec/21-app/01-chrome-extension/home-screen-modification/08-up-down-step-controls.md
 * DOM construction is delegated to nav-controls-dom.ts to honour the ≤100-line cap.
 */
import { clickWorkspaceByXPath, HomepageDashboardVariables, resolveElement } from "./homepage-dashboard-variables";
import { logError } from "./logger";
import {
    buildNavWrapper, NAV_ATTR, NAV_DOWN_VALUE, NAV_STEP_VALUE, NAV_UP_VALUE,
} from "./nav-controls-dom";
import { findByIndex, getSelected } from "./workspace-dictionary";
import { NavDirection, type WorkspaceDictionary } from "./types";

export { NavControlClasses } from "./nav-controls-dom";

export function mountNavControls(getDict: () => WorkspaceDictionary): () => void {
    try {
        return doMount(getDict);
    } catch (caught) {
        logError("navControls.mount", caught);
        return () => undefined;
    }
}

function doMount(getDict: () => WorkspaceDictionary): () => void {
    const anchor = resolveElement(HomepageDashboardVariables.LifetimeDeal.full);
    if (!(anchor instanceof HTMLElement)) {
        return () => undefined;
    }
    const wrap = buildNavWrapper();
    anchor.insertAdjacentElement("afterend", wrap);
    bindClicks(wrap, getDict);
    return () => wrap.remove();
}

function bindClicks(wrap: HTMLElement, getDict: () => WorkspaceDictionary): void {
    wrap.querySelector(`[${NAV_ATTR}="${NAV_UP_VALUE}"]`)?.addEventListener(
        "click", () => onNavClick(NavDirection.UP, getDict()),
    );
    wrap.querySelector(`[${NAV_ATTR}="${NAV_DOWN_VALUE}"]`)?.addEventListener(
        "click", () => onNavClick(NavDirection.DOWN, getDict()),
    );
}

export function readStep(): number {
    try {
        const el = document.querySelector<HTMLInputElement>(`[${NAV_ATTR}="${NAV_STEP_VALUE}"]`);
        const parsed = Number.parseInt(el?.value ?? "1", 10);
        return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
    } catch {
        return 1;
    }
}

export function computeTargetIndex(currentOneBased: number, total: number, dir: NavDirection, step: number): number {
    const delta = dir === NavDirection.UP ? -step : step;
    const next = currentOneBased + delta;
    if (next >= 1 && next <= total) {
        return next;
    }
    return clampToRange(next, total);
}

function clampToRange(n: number, total: number): number {
    if (n < 1) return 1;
    if (n > total) return total;
    return n;
}

export function onNavClick(dir: NavDirection, dict: WorkspaceDictionary): void {
    try {
        const current = getSelected(dict);
        if (current) {
            jumpFromCurrent(current.index, dir, dict);
        }
    } catch (caught) {
        logError("navClick", caught);
    }
}

function jumpFromCurrent(currentIndex: number, dir: NavDirection, dict: WorkspaceDictionary): void {
    const target = computeTargetIndex(currentIndex, dict.byIndex.length, dir, readStep());
    const record = findByIndex(dict, target);
    if (record) {
        clickWorkspaceByXPath(record.fullXPath);
    }
}
