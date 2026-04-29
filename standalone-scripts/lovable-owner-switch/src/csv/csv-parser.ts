/**
 * Owner Switch — top-level CSV parser.
 *
 * Pipeline:
 *   stripBom → splitCsv → resolveHeader → per-row extract
 *     → validateRow → validateFile (cross-row checks)
 *
 * Returns a `OwnerSwitchCsvParseResult` with rows + errors + warnings;
 * never throws. UI consumes this to populate the row table and block
 * task creation when `Errors.length > 0`.
 *
 * File-level guards run before any row work:
 *   - empty / whitespace-only / BOM-only files reject with a clear error
 *   - hard cap of `MAX_ROWS` data rows to prevent runaway sessions
 */

import { OwnerSwitchCsvColumn } from "./csv-column";
import { splitCsv } from "./csv-splitter";
import { resolveHeader } from "./csv-header";
import { readOptional, readRequired } from "./csv-cell";
import { validateRow, validateFile } from "./csv-validator";
import type { OwnerSwitchCsvRow, OwnerSwitchCsvParseResult, CsvParseError } from "./csv-types";

const BOM = "\uFEFF";
const MAX_ROWS = 1000;

const stripBom = (text: string): string => (text.startsWith(BOM) ? text.slice(BOM.length) : text);

const buildRow = (
    raw: ReadonlyArray<string>,
    indices: ReadonlyMap<OwnerSwitchCsvColumn, number>,
    rowIndex: number,
): OwnerSwitchCsvRow => ({
    RowIndex: rowIndex,
    LoginEmail: readRequired(raw, indices, OwnerSwitchCsvColumn.LoginEmail),
    Password: readOptional(raw, indices, OwnerSwitchCsvColumn.Password),
    OwnerEmail1: readRequired(raw, indices, OwnerSwitchCsvColumn.OwnerEmail1),
    OwnerEmail2: readOptional(raw, indices, OwnerSwitchCsvColumn.OwnerEmail2),
    Notes: readOptional(raw, indices, OwnerSwitchCsvColumn.Notes),
});

const tryBuildRow = (
    raw: ReadonlyArray<string>,
    indices: ReadonlyMap<OwnerSwitchCsvColumn, number>,
    rowIndex: number,
    errors: CsvParseError[],
): OwnerSwitchCsvRow | null => {
    try {
        return buildRow(raw, indices, rowIndex);
    } catch (caught: unknown) {
        const message = caught instanceof Error ? caught.message : String(caught);
        errors.push({ RowIndex: rowIndex, Column: null, Message: message });

        return null;
    }
};

export const parseOwnerSwitchCsv = (text: string): OwnerSwitchCsvParseResult => {
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
    const rows: OwnerSwitchCsvRow[] = [];

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
