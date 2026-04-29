/**
 * User Add — CSV barrel.
 *
 * Public surface for parser, validator, role normalizer, and types.
 * UI (P14) imports `parseUserAddCsv`; row state machine (P17)
 * consumes the typed row shapes for SQLite inserts.
 */

export { parseUserAddCsv } from "./csv-parser";
export { validateRow } from "./csv-validator";
export { isValidEmail } from "./email-validator";
export { normalizeRole } from "./role-normalizer";
export type { RoleNormalizeResult } from "./role-normalizer";
export { UserAddCsvColumn, ALL_COLUMNS, REQUIRED_COLUMNS } from "./csv-column";
export type {
    UserAddCsvRow,
    UserAddCsvParseResult,
    CsvParseError,
    CsvParseWarning,
} from "./csv-types";
