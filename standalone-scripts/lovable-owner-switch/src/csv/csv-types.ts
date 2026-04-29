/**
 * Owner Switch — parsed row + parse result types.
 *
 * `OwnerSwitchCsvRow` mirrors PascalCase column convention so SQLite
 * inserts (P10) can pass the row object straight through.
 */

export interface OwnerSwitchCsvRow {
    RowIndex: number;
    LoginEmail: string;
    Password: string | null;
    OwnerEmail1: string;
    OwnerEmail2: string | null;
    Notes: string | null;
}

export interface CsvParseError {
    RowIndex: number;
    Column: string | null;
    Message: string;
}

export interface CsvParseWarning {
    RowIndex: number | null;
    Message: string;
}

export interface OwnerSwitchCsvParseResult {
    Rows: ReadonlyArray<OwnerSwitchCsvRow>;
    Errors: ReadonlyArray<CsvParseError>;
    Warnings: ReadonlyArray<CsvParseWarning>;
}
