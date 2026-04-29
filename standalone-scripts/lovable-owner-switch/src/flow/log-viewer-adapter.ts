/**
 * Owner Switch — log → viewer adapter.
 *
 * Maps the project's `LogEntry` (Phase = Login/Promote/SignOut/Row/Task)
 * into the shared `LogViewerEntry` shape. The shared viewer treats
 * Phase as a free string, so this is a 1:1 field copy with the enum
 * value preserved as text.
 *
 * Severity codes already match (`Info`/`Warn`/`Error`).
 */

import { LogViewerSeverityCode } from "../../../lovable-common/src/ui/log-viewer-types";
import type { LogViewerEntry } from "../../../lovable-common/src/ui/log-viewer-types";
import { LogSeverity } from "./log-sink";
import type { LogEntry } from "./log-sink";

const mapSeverity = (severity: LogSeverity): LogViewerSeverityCode => {
    if (severity === LogSeverity.Error) {
        return LogViewerSeverityCode.Error;
    }

    if (severity === LogSeverity.Warn) {
        return LogViewerSeverityCode.Warn;
    }

    return LogViewerSeverityCode.Info;
};

export const toLogViewerEntries = (
    entries: ReadonlyArray<LogEntry>,
): ReadonlyArray<LogViewerEntry> => {
    return entries.map((e) => ({
        TimestampUtc: e.TimestampUtc,
        Phase: e.Phase,
        RowIndex: e.RowIndex,
        Severity: mapSeverity(e.Severity),
        Message: e.Message,
    }));
};
