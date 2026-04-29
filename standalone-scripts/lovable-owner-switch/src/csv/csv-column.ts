/**
 * Owner Switch — CSV column contract.
 *
 * Closed enum so parser + validator + UI all reference the same names.
 * Q4 default: cap at 2 OwnerEmail columns (OwnerEmail1 required,
 * OwnerEmail2 optional). Extra columns are ignored with a warning.
 */

export enum OwnerSwitchCsvColumn {
    LoginEmail = "LoginEmail",
    Password = "Password",
    OwnerEmail1 = "OwnerEmail1",
    OwnerEmail2 = "OwnerEmail2",
    Notes = "Notes",
}

export const REQUIRED_COLUMNS: ReadonlyArray<OwnerSwitchCsvColumn> = Object.freeze([
    OwnerSwitchCsvColumn.LoginEmail,
    OwnerSwitchCsvColumn.OwnerEmail1,
]);

export const OPTIONAL_COLUMNS: ReadonlyArray<OwnerSwitchCsvColumn> = Object.freeze([
    OwnerSwitchCsvColumn.Password,
    OwnerSwitchCsvColumn.OwnerEmail2,
    OwnerSwitchCsvColumn.Notes,
]);

export const ALL_COLUMNS: ReadonlyArray<OwnerSwitchCsvColumn> =
    Object.freeze([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);
