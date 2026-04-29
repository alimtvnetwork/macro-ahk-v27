/**
 * Owner Switch popup — rows table renderer.
 *
 * Pure render: takes a parse result, paints the tbody. No state, no
 * event listeners. Called by `popup-shell` whenever a CSV is loaded.
 */

import { CSS_ERROR_ROW, CSS_WARNING_ROW } from "./popup-constants";
import type { OwnerSwitchCsvParseResult, OwnerSwitchCsvRow, CsvParseError } from "../csv";

const ROW_HEADERS: ReadonlyArray<string> = Object.freeze([
    "#", "LoginEmail", "OwnerEmail1", "OwnerEmail2", "Notes",
]);

export { ROW_HEADERS };

const cellsFor = (row: OwnerSwitchCsvRow): ReadonlyArray<string> => [
    String(row.RowIndex),
    row.LoginEmail,
    row.OwnerEmail1,
    row.OwnerEmail2 ?? "",
    row.Notes ?? "",
];

const buildDataRow = (row: OwnerSwitchCsvRow, hasError: boolean): HTMLTableRowElement => {
    const tr = document.createElement("tr");

    if (hasError) {
        tr.className = CSS_ERROR_ROW;
    }

    for (const text of cellsFor(row)) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
    }

    return tr;
};

const errorIndices = (errors: ReadonlyArray<CsvParseError>): ReadonlySet<number> => {
    const out = new Set<number>();

    for (const err of errors) {
        out.add(err.RowIndex);
    }

    return out;
};

export const renderRows = (tbody: HTMLTableSectionElement, result: OwnerSwitchCsvParseResult): void => {
    tbody.textContent = "";
    const errIdx = errorIndices(result.Errors);

    for (const row of result.Rows) {
        tbody.appendChild(buildDataRow(row, errIdx.has(row.RowIndex)));
    }
};

export const _CSS_WARNING_ROW_REF: string = CSS_WARNING_ROW;
