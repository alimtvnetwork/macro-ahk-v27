/**
 * Owner Switch — row-level + file-level validation.
 *
 * `validateRow` runs after `csv-parser` produces a typed row. It
 * enforces email format, optional-field length caps, and that the two
 * owner-email columns are distinct (case-insensitive).
 *
 * `validateFile` runs once after all rows are built. It detects
 * duplicate `LoginEmail` values across rows (a known cause of double-
 * promotion failures when the same admin appears twice in one CSV).
 *
 * Both functions emit `CsvParseError`s — never throw. The UI renders
 * errors in the file-manager preview and blocks task creation if any
 * are present.
 */

import { OwnerSwitchCsvColumn } from "./csv-column";
import { isValidEmail } from "./email-validator";
import type { OwnerSwitchCsvRow, CsvParseError } from "./csv-types";

// Conservative caps — wider than realistic input, narrow enough to
// stop a 10MB cell from blowing up the SQLite insert.
const MAX_NOTES_LENGTH = 500;
const MAX_PASSWORD_LENGTH = 200;

const pushEmailError = (
    errors: CsvParseError[],
    rowIndex: number,
    column: OwnerSwitchCsvColumn,
    value: string,
): void => {
    errors.push({
        RowIndex: rowIndex,
        Column: column,
        Message: `Invalid email in ${column}: ${value}`,
    });
};

const validateOptionalEmail = (
    errors: CsvParseError[],
    rowIndex: number,
    column: OwnerSwitchCsvColumn,
    value: string | null,
): void => {
    if (value !== null && !isValidEmail(value)) {
        pushEmailError(errors, rowIndex, column, value);
    }
};

const validateLength = (
    errors: CsvParseError[],
    rowIndex: number,
    column: OwnerSwitchCsvColumn,
    value: string | null,
    max: number,
): void => {
    if (value !== null && value.length > max) {
        errors.push({
            RowIndex: rowIndex,
            Column: column,
            Message: `${column} exceeds max length ${max} (got ${value.length})`,
        });
    }
};

const validateOwnerPairDistinct = (
    errors: CsvParseError[],
    row: OwnerSwitchCsvRow,
): void => {
    if (row.OwnerEmail2 === null) return;
    if (row.OwnerEmail1.trim().toLowerCase() === row.OwnerEmail2.trim().toLowerCase()) {
        errors.push({
            RowIndex: row.RowIndex,
            Column: OwnerSwitchCsvColumn.OwnerEmail2,
            Message: `OwnerEmail2 duplicates OwnerEmail1 (${row.OwnerEmail1})`,
        });
    }
};

export const validateRow = (row: OwnerSwitchCsvRow): ReadonlyArray<CsvParseError> => {
    const errors: CsvParseError[] = [];

    if (!isValidEmail(row.LoginEmail)) {
        pushEmailError(errors, row.RowIndex, OwnerSwitchCsvColumn.LoginEmail, row.LoginEmail);
    }

    if (!isValidEmail(row.OwnerEmail1)) {
        pushEmailError(errors, row.RowIndex, OwnerSwitchCsvColumn.OwnerEmail1, row.OwnerEmail1);
    }

    validateOptionalEmail(errors, row.RowIndex, OwnerSwitchCsvColumn.OwnerEmail2, row.OwnerEmail2);

    validateLength(errors, row.RowIndex, OwnerSwitchCsvColumn.Password, row.Password, MAX_PASSWORD_LENGTH);
    validateLength(errors, row.RowIndex, OwnerSwitchCsvColumn.Notes, row.Notes, MAX_NOTES_LENGTH);

    validateOwnerPairDistinct(errors, row);

    return errors;
};

/**
 * File-level pass: detect duplicate `LoginEmail` rows (case-insensitive).
 * Each duplicate row gets its own error so all offenders surface in the UI.
 */
export const validateFile = (
    rows: ReadonlyArray<OwnerSwitchCsvRow>,
): ReadonlyArray<CsvParseError> => {
    const errors: CsvParseError[] = [];
    const seenAt = new Map<string, number>();

    for (const row of rows) {
        const key = row.LoginEmail.trim().toLowerCase();
        const firstSeen = seenAt.get(key);

        if (firstSeen === undefined) {
            seenAt.set(key, row.RowIndex);
            continue;
        }

        errors.push({
            RowIndex: row.RowIndex,
            Column: OwnerSwitchCsvColumn.LoginEmail,
            Message: `Duplicate LoginEmail (${row.LoginEmail}) — first seen on row ${firstSeen}`,
        });
    }

    return errors;
};
