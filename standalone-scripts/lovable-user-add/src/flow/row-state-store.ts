/**
 * User Add — row-state persistence interface.
 *
 * Storage-agnostic. Mirrors Owner Switch's `RowStateStore` so the
 * runtime SQLite adapter can bind both with the same UPDATE pattern
 * against `UserAddRow` (P12 schema).
 *
 * Q10 alignment: log persistence uses the same dependency-inversion
 * pattern via `LogSink` in `log-sink.ts`.
 */

import type { UserAddRowOutcomeCode } from "./row-types";

export interface UserAddRowStateUpdate {
    RowIndex: number;
    IsDone: boolean;
    HasError: boolean;
    LastError: string | null;
    StepBRan: boolean;
    CompletedAtUtc: string | null;
    /**
     * Final outcome — persisted distinctly so the UI / re-run logic
     * can recognize `StepBFailedMemberAdded` without parsing
     * `LastError`.
     */
    Outcome: UserAddRowOutcomeCode;
    /**
     * True when Step A POST succeeded (regardless of Step B outcome).
     * Re-runs MUST consult this to skip Step A and avoid 409 Conflict.
     */
    StepASucceeded: boolean;
    /**
     * Captured from Step A's MembershipSummary. Lets a re-run target
     * the PUT directly. Null when Step A never completed.
     */
    UserId: string | null;
    WorkspaceId: string | null;
}

export interface UserAddRowStateStore {
    update(update: UserAddRowStateUpdate): void;
}
