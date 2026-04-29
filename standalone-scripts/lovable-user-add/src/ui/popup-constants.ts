/**
 * User Add popup — DOM ID + class constants.
 *
 * Centralized so every UI module references the same selectors
 * (mem://ui/selector-standards). `lua-` prefix avoids collision with
 * Owner Switch's `los-` prefix when both popups load on the same page
 * (P18 shared editor scenario).
 */

export const ID_ROOT = "lovable-user-add-popup";
export const ID_FILE_INPUT = "lua-file-input";
export const ID_TASK_NAME = "lua-task-name";
export const ID_COMMON_PASSWORD = "lua-common-password";
export const ID_INCOGNITO_TOGGLE = "lua-incognito";
export const ID_LOGIN_URL = "lua-login-url";
export const ID_DEFAULT_ROLE = "lua-default-role";
export const ID_ROWS_TABLE = "lua-rows-table";
export const ID_ROWS_TBODY = "lua-rows-tbody";
export const ID_ERRORS_PANEL = "lua-errors-panel";
export const ID_RUN_BUTTON = "lua-run-button";

export const CSS_ROOT = "lua-root";
export const CSS_SECTION = "lua-section";
export const CSS_FIELD = "lua-field";
export const CSS_LABEL = "lua-label";
export const CSS_INPUT = "lua-input";
export const CSS_SELECT = "lua-select";
export const CSS_TABLE = "lua-table";
export const CSS_ERROR_ROW = "lua-error-row";
export const CSS_NORMALIZED_BADGE = "lua-normalized-badge";
export const CSS_BUTTON_PRIMARY = "lua-btn-primary";

export const DEFAULT_LOGIN_URL = "https://lovable.dev/login";
