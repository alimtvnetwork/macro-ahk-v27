/**
 * Shared Logs Viewer — DOM IDs, CSS class names, header strings.
 *
 * `lcl-` prefix (lovable-common-logs) so the viewer can mount inside
 * both `los-root` (Owner Switch) and `lua-root` (User Add) without
 * selector collision with `lcx-` (xpath editor) or host popups.
 * Naming follows `mem://architecture/constant-naming-convention`.
 */

export const ID_LOG_VIEWER_ROOT = "lcl-log-viewer";
export const ID_LOG_TABLE = "lcl-log-table";
export const ID_LOG_COPY_BUTTON = "lcl-copy-button";
export const ID_LOG_FILTER_PHASE = "lcl-filter-phase";
export const ID_LOG_COPY_STATUS = "lcl-copy-status";

export const CSS_VIEWER_ROOT = "lcl-viewer-root";
export const CSS_VIEWER_HEADER = "lcl-viewer-header";
export const CSS_VIEWER_TABLE = "lcl-viewer-table";
export const CSS_VIEWER_BTN = "lcl-viewer-btn";
export const CSS_VIEWER_BTN_PRIMARY = "lcl-viewer-btn-primary";
export const CSS_VIEWER_FILTER = "lcl-viewer-filter";
export const CSS_VIEWER_EMPTY = "lcl-viewer-empty";
export const CSS_PHASE_BADGE = "lcl-phase-badge";
export const CSS_SEVERITY_INFO = "lcl-sev-info";
export const CSS_SEVERITY_WARN = "lcl-sev-warn";
export const CSS_SEVERITY_ERROR = "lcl-sev-error";

export const HEADER_TIME = "Time";
export const HEADER_PHASE = "Phase";
export const HEADER_ROW = "Row";
export const HEADER_SEVERITY = "Severity";
export const HEADER_MESSAGE = "Message";

export const LABEL_COPY = "Copy all to clipboard";
export const LABEL_COPIED = "Copied ✓";
export const LABEL_COPY_FAILED = "Copy failed";
export const LABEL_FILTER_ALL = "All phases";
export const LABEL_EMPTY = "No log entries yet.";
export const TITLE_VIEWER = "Task logs";
