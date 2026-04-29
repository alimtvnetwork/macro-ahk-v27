/**
 * Lovable Common — XPath + delay defaults, shared LovableApiClient,
 * the shared XPath/delay editor (P18), and the shared logs viewer (P19).
 *
 * Consumed at runtime by lovable-owner-switch and lovable-user-add.
 */

export { XPathKeyCode } from "./xpath/xpath-key-code";
export { DefaultXPaths } from "./xpath/default-xpaths";
export { DefaultDelaysMs } from "./xpath/default-delays";
export type { XPathEntry } from "./xpath/xpath-entry";

export { LovableApiClient } from "./api/lovable-api-client";
export { LovableApiEndpoint } from "./api/lovable-api-endpoint";
export { LovableApiError } from "./api/lovable-api-error";
export { MembershipRoleApiCode } from "./api/membership-role-api-code";
export type {
    BearerTokenProvider,
} from "./api/lovable-api-client";
export type {
    AddMembershipRequest,
    MembershipSummary,
    UpdateMembershipRoleRequest,
    WorkspaceSummary,
} from "./api/lovable-api-types";

export {
    mountXPathEditor, buildDefaultEditorRows,
    buildEditorTable, readEditorRows,
    TITLE_EDITOR, LABEL_RESET, LABEL_SAVE,
} from "./ui";
export type { XPathEditorOptions, XPathEditorRow } from "./ui";

export {
    mountLogViewer, buildLogTable, copyEntriesToClipboard,
    formatEntriesAsText, formatTimestampLocal, formatRowIndex,
    buildFilterSelect, collectUniquePhases, filterEntries, FILTER_ALL_VALUE,
    LogViewerSeverityCode,
    TITLE_VIEWER, LABEL_COPY, LABEL_COPIED, LABEL_COPY_FAILED, LABEL_FILTER_ALL, LABEL_EMPTY,
} from "./ui";
export type { LogViewerEntry, LogViewerOptions } from "./ui";

export {
    RunSummaryScriptCode, RunSummaryRowStatus,
    renderRunSummaryAsJson, renderRunSummaryAsText,
} from "./report/run-summary-types";
export type {
    RunSummary, RunSummaryAction, RunSummaryCounts, RunSummaryRow,
} from "./report/run-summary-types";


