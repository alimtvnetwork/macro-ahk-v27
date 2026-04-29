/**
 * Owner Switch popup — DOM ID + class constants.
 *
 * Centralized so every UI module references the same selector strings
 * (mem://ui/selector-standards) and the P19 logs panel + P18 XPath
 * editor can mount alongside without collision.
 */

export const ID_ROOT = "lovable-owner-switch-popup";
export const ID_FILE_INPUT = "los-file-input";
export const ID_FILE_LIST = "los-file-list";
export const ID_TASK_NAME = "los-task-name";
export const ID_COMMON_PASSWORD = "los-common-password";
export const ID_INCOGNITO_TOGGLE = "los-incognito";
export const ID_LOGIN_URL = "los-login-url";
export const ID_ROWS_TABLE = "los-rows-table";
export const ID_ROWS_TBODY = "los-rows-tbody";
export const ID_ERRORS_PANEL = "los-errors-panel";
export const ID_RUN_BUTTON = "los-run-button";

export const CSS_ROOT = "los-root";
export const CSS_SECTION = "los-section";
export const CSS_FIELD = "los-field";
export const CSS_LABEL = "los-label";
export const CSS_INPUT = "los-input";
export const CSS_TABLE = "los-table";
export const CSS_ERROR_ROW = "los-error-row";
export const CSS_WARNING_ROW = "los-warning-row";
export const CSS_BUTTON_PRIMARY = "los-btn-primary";
export const CSS_BUTTON_DISABLED = "los-btn-disabled";

export const DEFAULT_LOGIN_URL = "https://lovable.dev/login";
