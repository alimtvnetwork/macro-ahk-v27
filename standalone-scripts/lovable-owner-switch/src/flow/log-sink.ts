/**
 * Owner Switch — per-task log writer.
 *
 * Q10 default: logs are SQLite-tagged rows, NOT files. Each entry is a
 * typed `LogEntry` carrying `TaskId` + `RowIndex` + `Phase` + `Severity`
 * + `Message` + `Timestamp` (ISO Asia/Kuala_Lumpur is rendered by the
 * UI; storage stores UTC ISO).
 *
 * Storage execution against `RiseupAsiaMacroExt.Sqlite` is wired by
 * P10's runtime adapter (next phase or P11+); this module exposes a
 * `LogSink` interface so the state machine code stays storage-agnostic.
 */

export enum LogPhase {
    Login = "Login",
    Promote = "Promote",
    SignOut = "SignOut",
    Row = "Row",
    Task = "Task",
}

export enum LogSeverity {
    Info = "Info",
    Warn = "Warn",
    Error = "Error",
}

export interface LogEntry {
    TaskId: string;
    RowIndex: number | null;
    Phase: LogPhase;
    Severity: LogSeverity;
    Message: string;
    TimestampUtc: string;
}

export interface LogSink {
    write(entry: LogEntry): void;
}

export const buildEntry = (
    taskId: string,
    rowIndex: number | null,
    phase: LogPhase,
    severity: LogSeverity,
    message: string,
): LogEntry => ({
    TaskId: taskId,
    RowIndex: rowIndex,
    Phase: phase,
    Severity: severity,
    Message: message,
    TimestampUtc: new Date().toISOString(),
});
