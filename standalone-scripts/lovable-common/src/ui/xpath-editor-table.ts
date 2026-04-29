/**
 * Shared XPath Editor — row + table DOM factories.
 *
 * Pure DOM builders. No event wiring here — `xpath-editor-shell.ts`
 * binds change handlers and Reset/Save buttons. Each function ≤ 15
 * lines per `mem://standards/formatting-and-logic`.
 */

import {
    CSS_EDITOR_DELAY, CSS_EDITOR_INPUT, CSS_EDITOR_TABLE,
    HEADER_DELAY, HEADER_KEY, HEADER_XPATH, ID_XPATH_TABLE,
} from "./xpath-editor-constants";
import type { XPathEditorRow } from "./xpath-editor-types";

const buildHeaderRow = (doc: Document): HTMLTableRowElement => {
    const tr = doc.createElement("tr");

    for (const text of [HEADER_KEY, HEADER_XPATH, HEADER_DELAY]) {
        const th = doc.createElement("th");
        th.textContent = text;
        tr.appendChild(th);
    }

    return tr;
};

const buildXPathInput = (doc: Document, value: string): HTMLInputElement => {
    const input = doc.createElement("input");
    input.type = "text";
    input.className = CSS_EDITOR_INPUT;
    input.value = value;

    return input;
};

const buildDelayInput = (doc: Document, value: number): HTMLInputElement => {
    const input = doc.createElement("input");
    input.type = "number";
    input.min = "0";
    input.className = CSS_EDITOR_DELAY;
    input.value = String(value);

    return input;
};

const buildBodyRow = (doc: Document, row: XPathEditorRow): HTMLTableRowElement => {
    const tr = doc.createElement("tr");
    const keyCell = doc.createElement("td");
    keyCell.textContent = row.KeyCode;
    const xpCell = doc.createElement("td");
    xpCell.appendChild(buildXPathInput(doc, row.XPath));
    const delayCell = doc.createElement("td");
    delayCell.appendChild(buildDelayInput(doc, row.DelayMs));
    tr.appendChild(keyCell);
    tr.appendChild(xpCell);
    tr.appendChild(delayCell);

    return tr;
};

export const buildEditorTable = (
    doc: Document, rows: ReadonlyArray<XPathEditorRow>,
): HTMLTableElement => {
    const table = doc.createElement("table");
    table.id = ID_XPATH_TABLE;
    table.className = CSS_EDITOR_TABLE;
    const thead = doc.createElement("thead");
    thead.appendChild(buildHeaderRow(doc));
    table.appendChild(thead);
    const tbody = doc.createElement("tbody");

    for (const row of rows) {
        tbody.appendChild(buildBodyRow(doc, row));
    }

    table.appendChild(tbody);

    return table;
};
