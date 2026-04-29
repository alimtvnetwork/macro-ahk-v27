/**
 * Shared Logs Viewer — phase filter dropdown.
 *
 * Builds a `<select>` whose options are the unique `Phase` strings
 * found in the entries plus an "All phases" sentinel. Step A / Step B
 * end up as separate options because they're distinct phase strings
 * (preserves P17's no-text-parsing contract).
 */

import {
    CSS_VIEWER_FILTER, ID_LOG_FILTER_PHASE, LABEL_FILTER_ALL,
} from "./log-viewer-constants";
import type { LogViewerEntry } from "./log-viewer-types";

export const FILTER_ALL_VALUE = "__all__";

export const collectUniquePhases = (entries: ReadonlyArray<LogViewerEntry>): ReadonlyArray<string> => {
    const seen = new Set<string>();

    for (const entry of entries) {
        seen.add(entry.Phase);
    }

    return Array.from(seen).sort((a, b) => a.localeCompare(b));
};

export const filterEntries = (
    entries: ReadonlyArray<LogViewerEntry>, phase: string,
): ReadonlyArray<LogViewerEntry> => {
    if (phase === FILTER_ALL_VALUE) {
        return entries;
    }

    return entries.filter((e) => e.Phase === phase);
};

export const buildFilterSelect = (
    doc: Document, entries: ReadonlyArray<LogViewerEntry>,
): HTMLSelectElement => {
    const select = doc.createElement("select");
    select.id = ID_LOG_FILTER_PHASE;
    select.className = CSS_VIEWER_FILTER;
    const allOpt = doc.createElement("option");
    allOpt.value = FILTER_ALL_VALUE;
    allOpt.textContent = LABEL_FILTER_ALL;
    select.appendChild(allOpt);

    for (const phase of collectUniquePhases(entries)) {
        const opt = doc.createElement("option");
        opt.value = phase;
        opt.textContent = phase;
        select.appendChild(opt);
    }

    return select;
};
