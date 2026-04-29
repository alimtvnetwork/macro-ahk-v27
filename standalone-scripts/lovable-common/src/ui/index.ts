/**
 * Shared UI barrel — XPath editor (P18) + Logs viewer (P19).
 *
 * Both modules are storage-agnostic and use distinct CSS prefixes
 * (`lcx-` editor, `lcl-` logs) so they can coexist inside Owner
 * Switch's `los-root` and User Add's `lua-root` without collision.
 */

export { mountXPathEditor } from "./xpath-editor-shell";
export { buildDefaultEditorRows } from "./xpath-editor-defaults";
export { buildEditorTable } from "./xpath-editor-table";
export { readEditorRows } from "./xpath-editor-reader";
export type { XPathEditorOptions, XPathEditorRow } from "./xpath-editor-types";
export { TITLE_EDITOR, LABEL_RESET, LABEL_SAVE } from "./xpath-editor-constants";

export { mountLogViewer } from "./log-viewer-shell";
export { buildLogTable } from "./log-viewer-table";
export { copyEntriesToClipboard } from "./log-viewer-copy";
export {
    formatEntriesAsText, formatTimestampLocal, formatRowIndex,
} from "./log-viewer-format";
export {
    buildFilterSelect, collectUniquePhases, filterEntries, FILTER_ALL_VALUE,
} from "./log-viewer-filter";
export { LogViewerSeverityCode } from "./log-viewer-types";
export type { LogViewerEntry, LogViewerOptions } from "./log-viewer-types";
export {
    TITLE_VIEWER, LABEL_COPY, LABEL_COPIED, LABEL_COPY_FAILED, LABEL_FILTER_ALL, LABEL_EMPTY,
} from "./log-viewer-constants";
