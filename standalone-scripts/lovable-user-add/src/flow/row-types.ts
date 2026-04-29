/**
 * User Add — per-row state machine types.
 *
 * `UserAddRowContext` bundles the parsed CSV row (WorkspaceUrl +
 * MemberEmail + RoleCode) and the shared API client. There are no
 * XPath overrides at this layer because Step A/B are both pure REST
 * (no DOM automation). Sign-out is task-level (see deviation note).
 *
 * **Login model deviation from spec line P17**: User Add has no
 * per-row login (CSV has no LoginEmail/Password — operator is
 * task-logged-in once via the popup). Sign-out is therefore
 * task-level (runs once after all rows), NOT per-row. Spec literal
 * "sign-out always runs" is reinterpreted as "task-end sign-out
 * always runs". Flag for P20 audit + user confirmation.
 *
 * Q3 carryover: `Row.WasEditorNormalized` is surfaced in the per-row
 * log entry so the audit trail shows Editor→Member coercion.
 */

import type { LovableApiClient } from "../../../lovable-common/src/api/lovable-api-client";
import type { UserAddCsvRow } from "../csv";

export interface UserAddTaskParams {
    TaskId: string;
    DefaultRoleCode: string;
}

export interface UserAddRowContext {
    Task: UserAddTaskParams;
    Row: UserAddCsvRow;
    Api: LovableApiClient;
}

export enum UserAddRowOutcomeCode {
    Succeeded = "Succeeded",
    StepAFailed = "StepAFailed",
    StepBFailed = "StepBFailed",
    /**
     * Step A POST succeeded (member is in the workspace) but Step B
     * PUT promote-to-Owner failed. Distinct from generic StepBFailed
     * so a re-run can SKIP Step A (avoiding 409 Conflict) and only
     * retry the PUT promote.
     *
     * Per operator direction: failure is **marked**, NOT rolled back —
     * the member added in Step A is intentionally left in place.
     */
    StepBFailedMemberAdded = "StepBFailedMemberAdded",
}

export interface UserAddRowResult {
    RowIndex: number;
    Outcome: UserAddRowOutcomeCode;
    IsDone: boolean;
    HasError: boolean;
    LastError: string | null;
    DurationMs: number;
    StepBRan: boolean;
    /**
     * True when Step A's POST returned 2xx (membership exists in
     * workspace) — even if the row overall failed at Step B.
     * Persisted so re-runs can skip Step A.
     */
    StepASucceeded: boolean;
    /**
     * UserId returned by Step A. Captured so a re-run can address the
     * PUT directly without re-issuing the POST. Null when Step A
     * never completed.
     */
    UserId: string | null;
    /**
     * WorkspaceId resolved during Step A. Same rationale as UserId.
     */
    WorkspaceId: string | null;
}
