/**
 * Spec: spec/21-app/01-chrome-extension/home-screen-modification/05-search-bar.md
 * Hardcoded Tailwind class set per user confirmation.
 */
import { clickWorkspaceByXPath, HomepageDashboardVariables, resolveElement } from "./homepage-dashboard-variables";
import { logError } from "./logger";
import type { WorkspaceDictionary, WorkspaceRecord } from "./types";

export const SearchBarClasses = {
    WRAPPER: "mt-2 mb-1 px-2",
    INPUT: "w-full rounded-md border border-white/10 bg-white/5 px-2 py-1 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/30",
} as const;

const ATTR = "data-marco-home";
const WRAPPER_VALUE = "search-wrapper";
const INPUT_VALUE = "search-input";
const DEBOUNCE_MS = 80;

export function mountSearchBar(getDict: () => WorkspaceDictionary): () => void {
    try {
        return doMount(getDict);
    } catch (caught) {
        logError("SearchBar.mount", caught);
        return () => undefined;
    }
}

function doMount(getDict: () => WorkspaceDictionary): () => void {
    const anchor = resolveElement(HomepageDashboardVariables.AllWorkspaceName.full);
    if (!(anchor instanceof HTMLElement)) {
        return () => undefined;
    }
    const wrapper = buildWrapper();
    anchor.insertAdjacentElement("afterend", wrapper);
    bindInput(wrapper, getDict);
    return () => wrapper.remove();
}

function buildWrapper(): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.className = SearchBarClasses.WRAPPER;
    wrap.setAttribute(ATTR, WRAPPER_VALUE);
    wrap.appendChild(buildInput());
    return wrap;
}

function buildInput(): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "text";
    input.className = SearchBarClasses.INPUT;
    input.placeholder = "Search workspaces…";
    input.setAttribute(ATTR, INPUT_VALUE);
    input.setAttribute("aria-label", "Search workspaces");
    return input;
}

function bindInput(wrapper: HTMLElement, getDict: () => WorkspaceDictionary): void {
    const input = wrapper.querySelector<HTMLInputElement>(`[${ATTR}="${INPUT_VALUE}"]`);
    let timer: number | null = null;
    input?.addEventListener("input", () => {
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(() => applyFilter(input.value, getDict()), DEBOUNCE_MS);
    });
    input?.addEventListener("keydown", (e) => handleEnter(e, input.value, getDict()));
}

function handleEnter(e: KeyboardEvent, value: string, dict: WorkspaceDictionary): void {
    if (e.key !== "Enter") {
        return;
    }
    e.preventDefault();
    onSearchEnter(onSearchInput(value, dict));
}

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

function applyFilter(value: string, dict: WorkspaceDictionary): void {
    const matches = onSearchInput(value, dict);
    const visibleNames = new Set(matches.map((m) => m.name));
    for (const r of dict.byIndex) {
        const el = resolveElement(r.fullXPath);
        if (el instanceof HTMLElement) {
            el.style.display = visibleNames.has(r.name) ? "" : "none";
        }
    }
}
