/**
 * Owner Switch — CSV barrel.
 *
 * Public surface for parser, validator, and types. UI (P7) imports
 * `parseOwnerSwitchCsv` only; row state machine (P10) uses the typed
 * row + error shapes for SQLite inserts and error rendering.
 */

export { parseOwnerSwitchCsv } from "./csv-parser";
export { validateRow } from "./csv-validator";
export { isValidEmail } from "./email-validator";
export { OwnerSwitchCsvColumn, ALL_COLUMNS, REQUIRED_COLUMNS } from "./csv-column";
export type {
    OwnerSwitchCsvRow,
    OwnerSwitchCsvParseResult,
    CsvParseError,
    CsvParseWarning,
} from "./csv-types";
