/**
 * Spec: spec/21-app/01-chrome-extension/home-screen-modification/04-workspace-dictionary.md
 * One-pass scrape; downstream features MUST read from this dictionary, no DOM walks.
 */
import { loadCreditMap } from "./credit-source";
import { HomepageDashboardVariables, resolveElement, resolveFullXPath } from "./homepage-dashboard-variables";
import { logError, logWarn } from "./logger";
import type { CreditMap, WorkspaceDictionary, WorkspaceRecord } from "./types";

export async function buildWorkspaceDictionary(): Promise<WorkspaceDictionary> {
    try {
        const items = scrapeWorkspaceItems();
        const credits = await loadCreditMap();
        return assembleDictionary(items, credits);
    } catch (caught) {
        logError("WorkspaceDictionary.build", caught);
        return emptyDictionary();
    }
}

function scrapeWorkspaceItems(): Omit<WorkspaceRecord, "creditAvailable" | "creditTotal">[] {
    const list = resolveElement(HomepageDashboardVariables.WorkspacesList.full);
    if (!list) {
        logWarn("WorkspaceDictionary.scrape", `CODE RED: WorkspacesList missing at ${HomepageDashboardVariables.WorkspacesList.full}`);
        return [];
    }
    return Array.from(list.children).map((el, i) => buildItemRecord(el, i + 1));
}

function buildItemRecord(_el: Element, oneBased: number): Omit<WorkspaceRecord, "creditAvailable" | "creditTotal"> {
    const fullXPath = resolveFullXPath("WorkspaceItem", oneBased);
    const proLabelXPath = resolveFullXPath("ProLabel", oneBased);
    const name = readItemName(oneBased);
    const isSelected = resolveElement(resolveFullXPath("SelectionMarkerSvg", oneBased)) !== null;
    return { index: oneBased, name, fullXPath, proLabelXPath, isSelected };
}

function readItemName(oneBased: number): string {
    const textEl = resolveElement(resolveFullXPath("WorkspaceItemText", oneBased));
    return textEl?.textContent?.trim() ?? "";
}

function assembleDictionary(
    items: Omit<WorkspaceRecord, "creditAvailable" | "creditTotal">[],
    credits: CreditMap,
): WorkspaceDictionary {
    const byIndex = items.map((p) => mergeCredit(p, credits));
    const byName = Object.fromEntries(byIndex.map((r) => [r.name, r]));
    const selectedIndex = findSelectedIndex(byIndex);
    return { byIndex, byName, selectedIndex };
}

function mergeCredit(partial: Omit<WorkspaceRecord, "creditAvailable" | "creditTotal">, credits: CreditMap): WorkspaceRecord {
    const pair = credits.get(partial.name);
    if (!pair) {
        logWarn("WorkspaceDictionary.merge", `no credit for "${partial.name}"`);
    }
    return { ...partial, creditAvailable: pair?.available ?? 0, creditTotal: pair?.total ?? 0 };
}

function findSelectedIndex(records: WorkspaceRecord[]): number | null {
    const idx = records.findIndex((r) => r.isSelected);
    return idx === -1 ? null : idx;
}

function emptyDictionary(): WorkspaceDictionary {
    return { byName: {}, byIndex: [], selectedIndex: null };
}

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
