/**
 * User Add — per-cell extractors.
 *
 * Same shape as Owner Switch's `csv-cell.ts`. Optional → null; required
 * throws so the parser can record a typed error.
 */

import { UserAddCsvColumn } from "./csv-column";

export const readOptional = (
    row: ReadonlyArray<string>,
    indices: ReadonlyMap<UserAddCsvColumn, number>,
    column: UserAddCsvColumn,
): string | null => {
    const idx = indices.get(column);

    if (idx === undefined) {
        return null;
    }

    const raw = idx < row.length ? row[idx].trim() : "";

    return raw.length === 0 ? null : raw;
};

export const readRequired = (
    row: ReadonlyArray<string>,
    indices: ReadonlyMap<UserAddCsvColumn, number>,
    column: UserAddCsvColumn,
): string => {
    const value = readOptional(row, indices, column);

    if (value === null) {
        throw new Error(`Required cell empty: ${column}`);
    }

    return value;
};
