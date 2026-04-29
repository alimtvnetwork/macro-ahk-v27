/**
 * User Add — parsed row + parse result types.
 *
 * `RawRole` preserves the CSV input (case-insensitive, may be `Editor`).
 * `RoleCode` is the normalized enum value the row state machine
 * consumes. When `Role` cell is null, `RoleCode` is also null and the
 * task's `DefaultRoleCode` is applied at task-creation time.
 *
 * `WasEditorNormalized: true` flags rows where Editor → Member
 * substitution occurred (Q3); P19 logs viewer surfaces these as info.
 */

import type { UserAddMembershipRoleCode } from "../migrations/membership-role-seed";

export interface UserAddCsvRow {
    RowIndex: number;
    WorkspaceUrl: string;
    MemberEmail: string;
    RawRole: string | null;
    RoleCode: UserAddMembershipRoleCode | null;
    WasEditorNormalized: boolean;
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

export interface UserAddCsvParseResult {
    Rows: ReadonlyArray<UserAddCsvRow>;
    Errors: ReadonlyArray<CsvParseError>;
    Warnings: ReadonlyArray<CsvParseWarning>;
}
