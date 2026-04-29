/**
 * Owner Switch — header → column index resolver.
 *
 * Validates required columns are present, builds a `Map<column, index>`
 * for parser consumption, and emits warnings for unknown extra columns
 * (Q4 default: extra OwnerEmail3+ ignored with a warning, not error).
 */

import { OwnerSwitchCsvColumn, REQUIRED_COLUMNS, ALL_COLUMNS } from "./csv-column";
import type { CsvParseError, CsvParseWarning } from "./csv-types";

export interface HeaderResolution {
    Indices: ReadonlyMap<OwnerSwitchCsvColumn, number>;
    Errors: ReadonlyArray<CsvParseError>;
    Warnings: ReadonlyArray<CsvParseWarning>;
}

const HEADER_ROW_INDEX = 0;

const buildIndexMap = (header: ReadonlyArray<string>): Map<OwnerSwitchCsvColumn, number> => {
    const out = new Map<OwnerSwitchCsvColumn, number>();

    for (const column of ALL_COLUMNS) {
        const idx = header.findIndex((h) => h.trim() === column);

        if (idx >= 0) {
            out.set(column, idx);
        }
    }

    return out;
};

const collectMissingErrors = (
    indices: ReadonlyMap<OwnerSwitchCsvColumn, number>,
): CsvParseError[] => {
    const errors: CsvParseError[] = [];

    for (const required of REQUIRED_COLUMNS) {
        if (!indices.has(required)) {
            errors.push({
                RowIndex: HEADER_ROW_INDEX,
                Column: required,
                Message: `Required column missing: ${required}`,
            });
        }
    }

    return errors;
};

const collectUnknownWarnings = (header: ReadonlyArray<string>): CsvParseWarning[] => {
    const known: ReadonlySet<string> = new Set(ALL_COLUMNS);
    const warnings: CsvParseWarning[] = [];

    for (const raw of header) {
        const name = raw.trim();

        if (name.length > 0 && !known.has(name)) {
            warnings.push({
                RowIndex: HEADER_ROW_INDEX,
                Message: `Unknown column ignored: ${name}`,
            });
        }
    }

    return warnings;
};

export const resolveHeader = (header: ReadonlyArray<string>): HeaderResolution => {
    const indices = buildIndexMap(header);

    return {
        Indices: indices,
        Errors: collectMissingErrors(indices),
        Warnings: collectUnknownWarnings(header),
    };
};
