/**
 * User Add — per-task log writer.
 *
 * P19 requires Step A and Step B log lines to be **distinguishable**.
 * The `LogPhase` enum has dedicated `StepA` and `StepB` values (not
 * the generic `Promote` used by Owner Switch) so the logs viewer can
 * filter/colourise without parsing message text.
 *
 * Q10 default: SQLite-backed. This module exposes `LogSink` so the
 * state machine stays storage-agnostic; the runtime adapter binds
 * SQLite INSERT to the `UserAddLog` table (P12 schema).
 */

export enum UserAddLogPhase {
    StepA = "StepA",
    StepB = "StepB",
    Row = "Row",
    Task = "Task",
    SignOut = "SignOut",
}

export enum UserAddLogSeverity {
    Info = "Info",
    Warn = "Warn",
    Error = "Error",
}

export interface UserAddLogEntry {
    TaskId: string;
    RowIndex: number | null;
    Phase: UserAddLogPhase;
    Severity: UserAddLogSeverity;
    Message: string;
    TimestampUtc: string;
}

export interface UserAddLogSink {
    write(entry: UserAddLogEntry): void;
}

export const buildUserAddEntry = (
    taskId: string, rowIndex: number | null,
    phase: UserAddLogPhase, severity: UserAddLogSeverity, message: string,
): UserAddLogEntry => ({
    TaskId: taskId, RowIndex: rowIndex, Phase: phase,
    Severity: severity, Message: message,
    TimestampUtc: new Date().toISOString(),
});
