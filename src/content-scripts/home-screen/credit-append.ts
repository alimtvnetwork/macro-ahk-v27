/**
 * Spec: spec/21-app/01-chrome-extension/home-screen-modification/07-pro-label-credit-append.md
 * Idempotent upsert — never duplicates the span.
 */
import { resolveElement } from "./homepage-dashboard-variables";
import { logError, logWarn } from "./logger";
import type { WorkspaceRecord } from "./types";

export const CreditAppendClasses = { SPAN: "ml-1 text-xs opacity-70" } as const;
const ATTR = "data-marco-home";
const MARKER_VALUE = "credit-append";

export function appendCreditToProLabel(record: WorkspaceRecord): void {
    try {
        const proEl = resolveElement(record.proLabelXPath);
        if (proEl instanceof HTMLElement) {
            upsertCreditSpan(proEl, record.creditAvailable, record.creditTotal);
            return;
        }
        logWarn("appendCredit", `pro label missing for "${record.name}"`);
    } catch (caught) {
        logError("appendCredit", caught);
    }
}

function upsertCreditSpan(parent: HTMLElement, available: number, total: number): void {
    const existing = parent.querySelector<HTMLSpanElement>(`[${ATTR}="${MARKER_VALUE}"]`);
    if (existing) {
        existing.textContent = formatCredit(available, total);
        return;
    }
    parent.appendChild(buildSpan(available, total));
}

function buildSpan(available: number, total: number): HTMLSpanElement {
    const span = document.createElement("span");
    span.className = CreditAppendClasses.SPAN;
    span.setAttribute(ATTR, MARKER_VALUE);
    span.textContent = formatCredit(available, total);
    return span;
}

function formatCredit(available: number, total: number): string {
    return `${available} / ${total}`;
}

export function appendCreditsForAll(records: WorkspaceRecord[]): void {
    for (const r of records) {
        appendCreditToProLabel(r);
    }
}
