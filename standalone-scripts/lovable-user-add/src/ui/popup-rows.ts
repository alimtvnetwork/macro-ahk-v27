/**
 * User Add popup — rows table renderer.
 *
 * Pure render. Surfaces `WasEditorNormalized` as a small inline badge
 * next to the role cell so the operator sees Editor→Member rewrites
 * before clicking Run.
 */

import { CSS_ERROR_ROW, CSS_NORMALIZED_BADGE } from "./popup-constants";
import type { UserAddCsvParseResult, UserAddCsvRow, CsvParseError } from "../csv";

const ROW_HEADERS: ReadonlyArray<string> = Object.freeze([
    "#", "WorkspaceUrl", "MemberEmail", "Role", "Notes",
]);

export { ROW_HEADERS };

const appendCell = (tr: HTMLTableRowElement, text: string): HTMLTableCellElement => {
    const td = document.createElement("td");
    td.textContent = text;
    tr.appendChild(td);

    return td;
};

const appendRoleCell = (tr: HTMLTableRowElement, row: UserAddCsvRow): void => {
    const td = appendCell(tr, row.RoleCode ?? "<default>");

    if (row.WasEditorNormalized) {
        const badge = document.createElement("span");
        badge.className = CSS_NORMALIZED_BADGE;
        badge.textContent = "Editor→Member";
        td.appendChild(badge);
    }
};

const buildDataRow = (row: UserAddCsvRow, hasError: boolean): HTMLTableRowElement => {
    const tr = document.createElement("tr");

    if (hasError) {
        tr.className = CSS_ERROR_ROW;
    }

    appendCell(tr, String(row.RowIndex));
    appendCell(tr, row.WorkspaceUrl);
    appendCell(tr, row.MemberEmail);
    appendRoleCell(tr, row);
    appendCell(tr, row.Notes ?? "");

    return tr;
};

const errorIndices = (errors: ReadonlyArray<CsvParseError>): ReadonlySet<number> => {
    const out = new Set<number>();

    for (const err of errors) {
        out.add(err.RowIndex);
    }

    return out;
};

export const renderRows = (tbody: HTMLTableSectionElement, result: UserAddCsvParseResult): void => {
    tbody.textContent = "";
    const errIdx = errorIndices(result.Errors);

    for (const row of result.Rows) {
        tbody.appendChild(buildDataRow(row, errIdx.has(row.RowIndex)));
    }
};
