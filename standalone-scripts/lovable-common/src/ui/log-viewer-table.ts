/**
 * Shared Logs Viewer — table DOM factory.
 *
 * Pure builder: takes `LogViewerEntry[]` → `<table>`. Empty arrays
 * are handled by `log-viewer-shell.ts` so this module only renders
 * non-empty data.
 */

import {
    CSS_PHASE_BADGE, CSS_VIEWER_TABLE,
    HEADER_MESSAGE, HEADER_PHASE, HEADER_ROW, HEADER_SEVERITY, HEADER_TIME,
    ID_LOG_TABLE,
} from "./log-viewer-constants";
import { cssClassForSeverity, formatRowIndex, formatTimestampLocal } from "./log-viewer-format";
import type { LogViewerEntry } from "./log-viewer-types";

const HEADERS: ReadonlyArray<string> = [
    HEADER_TIME, HEADER_PHASE, HEADER_ROW, HEADER_SEVERITY, HEADER_MESSAGE,
];

const buildHeaderRow = (doc: Document): HTMLTableRowElement => {
    const tr = doc.createElement("tr");

    for (const text of HEADERS) {
        const th = doc.createElement("th");
        th.textContent = text;
        tr.appendChild(th);
    }

    return tr;
};

const buildPhaseCell = (doc: Document, phase: string): HTMLTableCellElement => {
    const td = doc.createElement("td");
    const badge = doc.createElement("span");
    badge.className = CSS_PHASE_BADGE;
    badge.textContent = phase;
    td.appendChild(badge);

    return td;
};

const buildSeverityCell = (doc: Document, entry: LogViewerEntry): HTMLTableCellElement => {
    const td = doc.createElement("td");
    td.className = cssClassForSeverity(entry.Severity);
    td.textContent = entry.Severity;

    return td;
};

const buildBodyRow = (doc: Document, entry: LogViewerEntry): HTMLTableRowElement => {
    const tr = doc.createElement("tr");
    const time = doc.createElement("td");
    time.textContent = formatTimestampLocal(entry.TimestampUtc);
    const row = doc.createElement("td");
    row.textContent = formatRowIndex(entry.RowIndex);
    const message = doc.createElement("td");
    message.textContent = entry.Message;
    tr.appendChild(time);
    tr.appendChild(buildPhaseCell(doc, entry.Phase));
    tr.appendChild(row);
    tr.appendChild(buildSeverityCell(doc, entry));
    tr.appendChild(message);

    return tr;
};

export const buildLogTable = (
    doc: Document, entries: ReadonlyArray<LogViewerEntry>,
): HTMLTableElement => {
    const table = doc.createElement("table");
    table.id = ID_LOG_TABLE;
    table.className = CSS_VIEWER_TABLE;
    const thead = doc.createElement("thead");
    thead.appendChild(buildHeaderRow(doc));
    table.appendChild(thead);
    const tbody = doc.createElement("tbody");

    for (const entry of entries) {
        tbody.appendChild(buildBodyRow(doc, entry));
    }

    table.appendChild(tbody);

    return table;
};
