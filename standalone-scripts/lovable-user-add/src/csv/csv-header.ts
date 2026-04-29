/**
 * User Add — header → column index resolver.
 *
 * Same pipeline as Owner Switch: missing required → error; unknown
 * extra column → warning (ignored, not error). Case-sensitive header
 * match (PascalCase) — the UI surfaces the exact required names.
 */

import { UserAddCsvColumn, REQUIRED_COLUMNS, ALL_COLUMNS } from "./csv-column";
import type { CsvParseError, CsvParseWarning } from "./csv-types";

export interface HeaderResolution {
    Indices: ReadonlyMap<UserAddCsvColumn, number>;
    Errors: ReadonlyArray<CsvParseError>;
    Warnings: ReadonlyArray<CsvParseWarning>;
}

const HEADER_ROW_INDEX = 0;

const buildIndexMap = (header: ReadonlyArray<string>): Map<UserAddCsvColumn, number> => {
    const out = new Map<UserAddCsvColumn, number>();

    for (const column of ALL_COLUMNS) {
        const idx = header.findIndex((h) => h.trim() === column);

        if (idx >= 0) {
            out.set(column, idx);
        }
    }

    return out;
};

const collectMissingErrors = (
    indices: ReadonlyMap<UserAddCsvColumn, number>,
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
