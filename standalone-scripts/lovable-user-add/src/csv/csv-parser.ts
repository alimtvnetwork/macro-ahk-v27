/**
 * User Add — top-level CSV parser.
 *
 * Pipeline:
 *   stripBom → splitCsv → resolveHeader → per-row extract + role
 *     normalize → validateRow → validateFile (cross-row checks)
 *
 * Returns `UserAddCsvParseResult`; never throws. UI consumes this to
 * render the row preview and block task creation when `Errors.length > 0`.
 *
 * File-level guards run before any row work:
 *   - empty / whitespace-only / BOM-only files reject with a clear error
 *   - hard cap of `MAX_ROWS` data rows to prevent runaway sessions
 */

import { UserAddCsvColumn } from "./csv-column";
import { splitCsv } from "./csv-splitter";
import { resolveHeader } from "./csv-header";
import { readOptional, readRequired } from "./csv-cell";
import { normalizeRole } from "./role-normalizer";
import { validateRow, validateFile } from "./csv-validator";
import type { UserAddCsvRow, UserAddCsvParseResult, CsvParseError } from "./csv-types";

const BOM = "\uFEFF";
const MAX_ROWS = 1000;

const stripBom = (text: string): string => (text.startsWith(BOM) ? text.slice(BOM.length) : text);

const buildRow = (
    raw: ReadonlyArray<string>,
    indices: ReadonlyMap<UserAddCsvColumn, number>,
    rowIndex: number,
    errors: CsvParseError[],
): UserAddCsvRow => {
    const rawRole = readOptional(raw, indices, UserAddCsvColumn.Role);
    const role = normalizeRole(rawRole);

    if (role.Error !== null) {
        errors.push({ RowIndex: rowIndex, Column: UserAddCsvColumn.Role, Message: role.Error });
    }

    return {
        RowIndex: rowIndex,
        WorkspaceUrl: readRequired(raw, indices, UserAddCsvColumn.WorkspaceUrl),
        MemberEmail: readRequired(raw, indices, UserAddCsvColumn.MemberEmail),
        RawRole: rawRole,
        RoleCode: role.RoleCode,
        WasEditorNormalized: role.WasEditorNormalized,
        Notes: readOptional(raw, indices, UserAddCsvColumn.Notes),
    };
};

const tryBuildRow = (
    raw: ReadonlyArray<string>,
    indices: ReadonlyMap<UserAddCsvColumn, number>,
    rowIndex: number,
    errors: CsvParseError[],
): UserAddCsvRow | null => {
    try {
        return buildRow(raw, indices, rowIndex, errors);
    } catch (caught: unknown) {
        const message = caught instanceof Error ? caught.message : String(caught);
        errors.push({ RowIndex: rowIndex, Column: null, Message: message });

        return null;
    }
};

export const parseUserAddCsv = (text: string): UserAddCsvParseResult => {
    const cleaned = stripBom(text);

    if (cleaned.trim().length === 0) {
        return {
            Rows: [],
            Errors: [{ RowIndex: 0, Column: null, Message: "CSV is empty (no header, no rows)" }],
            Warnings: [],
        };
    }

    const grid = splitCsv(cleaned);

    if (grid.length === 0) {
        return { Rows: [], Errors: [{ RowIndex: 0, Column: null, Message: "CSV is empty" }], Warnings: [] };
    }

    const header = resolveHeader(grid[0]);
    const errors: CsvParseError[] = [...header.Errors];
    const rows: UserAddCsvRow[] = [];

    const dataRowCount = grid.length - 1;
    if (dataRowCount > MAX_ROWS) {
        errors.push({
            RowIndex: 0,
            Column: null,
            Message: `Too many rows: ${dataRowCount} (max ${MAX_ROWS}). Split the CSV into smaller batches.`,
        });
        return { Rows: [], Errors: errors, Warnings: header.Warnings };
    }

    for (let i = 1; i < grid.length; i += 1) {
        const row = tryBuildRow(grid[i], header.Indices, i, errors);

        if (row !== null) {
            rows.push(row);
            errors.push(...validateRow(row));
        }
    }

    errors.push(...validateFile(rows));

    return { Rows: rows, Errors: errors, Warnings: header.Warnings };
};
