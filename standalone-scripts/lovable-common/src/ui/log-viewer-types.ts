/**
 * Shared Logs Viewer — types.
 *
 * `LogViewerEntry` is the normalized shape both projects map to:
 * - Owner Switch: `LogEntry` (Phase = Login/Promote/SignOut/Row/Task)
 * - User Add:    `UserAddLogEntry` (Phase = StepA/StepB/Row/Task/SignOut)
 * Phase is a free string so each project keeps its own enum without
 * the viewer needing to know about either. Step A vs B distinction
 * (P17 contract) is preserved as the literal phase string "StepA"/"StepB".
 */

export enum LogViewerSeverityCode {
    Info = "Info",
    Warn = "Warn",
    Error = "Error",
}

export interface LogViewerEntry {
    TimestampUtc: string;
    Phase: string;
    RowIndex: number | null;
    Severity: LogViewerSeverityCode;
    Message: string;
}

export interface LogViewerOptions {
    Entries: ReadonlyArray<LogViewerEntry>;
    OnCopy?: (text: string) => Promise<boolean>;
}
