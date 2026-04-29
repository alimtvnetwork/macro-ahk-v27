/**
 * User Add — log → viewer adapter.
 *
 * Maps `UserAddLogEntry` (Phase = StepA/StepB/Row/Task/SignOut) into
 * the shared `LogViewerEntry` shape. P17 contract: Step A and Step B
 * remain distinguishable because their phase strings carry through
 * unchanged into the viewer's filter dropdown — no text parsing.
 */

import { LogViewerSeverityCode } from "../../../lovable-common/src/ui/log-viewer-types";
import type { LogViewerEntry } from "../../../lovable-common/src/ui/log-viewer-types";
import { UserAddLogSeverity } from "./log-sink";
import type { UserAddLogEntry } from "./log-sink";

const mapSeverity = (severity: UserAddLogSeverity): LogViewerSeverityCode => {
    if (severity === UserAddLogSeverity.Error) {
        return LogViewerSeverityCode.Error;
    }

    if (severity === UserAddLogSeverity.Warn) {
        return LogViewerSeverityCode.Warn;
    }

    return LogViewerSeverityCode.Info;
};

export const toUserAddLogViewerEntries = (
    entries: ReadonlyArray<UserAddLogEntry>,
): ReadonlyArray<LogViewerEntry> => {
    return entries.map((e) => ({
        TimestampUtc: e.TimestampUtc,
        Phase: e.Phase,
        RowIndex: e.RowIndex,
        Severity: mapSeverity(e.Severity),
        Message: e.Message,
    }));
};
