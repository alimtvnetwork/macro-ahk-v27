/**
 * Shared Logs Viewer — pure formatting helpers.
 *
 * - `formatTimestampLocal` renders the stored UTC ISO into Asia/Kuala_Lumpur
 *   per `mem://localization/timezone`.
 * - `formatRowIndex` renders `null` (task-level entries) as "—" so the
 *   table never shows literal "null".
 * - `formatEntriesAsText` produces the plain-text payload for the
 *   "Copy all to clipboard" button. Format is tab-separated so the
 *   user can paste into a spreadsheet or grep it.
 */

import { LogViewerSeverityCode } from "./log-viewer-types";
import type { LogViewerEntry } from "./log-viewer-types";

const KL_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
};

export const formatTimestampLocal = (utcIso: string): string => {
    const d = new Date(utcIso);

    if (Number.isNaN(d.getTime())) {
        return utcIso;
    }

    return new Intl.DateTimeFormat("en-CA", KL_TIME_OPTIONS).format(d);
};

export const formatRowIndex = (rowIndex: number | null): string => {
    if (rowIndex === null) {
        return "—";
    }

    return String(rowIndex);
};

export const cssClassForSeverity = (severity: LogViewerSeverityCode): string => {
    if (severity === LogViewerSeverityCode.Error) {
        return "lcl-sev-error";
    }

    if (severity === LogViewerSeverityCode.Warn) {
        return "lcl-sev-warn";
    }

    return "lcl-sev-info";
};

export const formatEntriesAsText = (entries: ReadonlyArray<LogViewerEntry>): string => {
    const header = ["Time", "Phase", "Row", "Severity", "Message"].join("\t");
    const lines = entries.map((e) => [
        formatTimestampLocal(e.TimestampUtc), e.Phase,
        formatRowIndex(e.RowIndex), e.Severity, e.Message,
    ].join("\t"));

    return [header, ...lines].join("\n");
};
