/**
 * Owner Switch — per-cell extractors.
 *
 * Reads a column out of a raw row, trimming and converting empty
 * strings to `null` for optional fields. Required fields throw when
 * empty so the validator can report a typed error.
 */

import { OwnerSwitchCsvColumn } from "./csv-column";

export const readOptional = (
    row: ReadonlyArray<string>,
    indices: ReadonlyMap<OwnerSwitchCsvColumn, number>,
    column: OwnerSwitchCsvColumn,
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
    indices: ReadonlyMap<OwnerSwitchCsvColumn, number>,
    column: OwnerSwitchCsvColumn,
): string => {
    const value = readOptional(row, indices, column);

    if (value === null) {
        throw new Error(`Required cell empty: ${column}`);
    }

    return value;
};
