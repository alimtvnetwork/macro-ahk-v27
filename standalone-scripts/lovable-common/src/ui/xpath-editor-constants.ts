/**
 * Shared XPath Editor — DOM IDs, CSS class names, header strings.
 *
 * `lcx-` prefix (lovable-common-xpath) so the editor can mount inside
 * both `los-root` (Owner Switch) and `lua-root` (User Add) without
 * selector collision. All IDs/classes follow the SCREAMING_SNAKE_CASE
 * + ID_/CSS_ prefix convention (mem://architecture/constant-naming-convention).
 */

export const ID_XPATH_EDITOR_ROOT = "lcx-xpath-editor";
export const ID_XPATH_TABLE = "lcx-xpath-table";
export const ID_RESET_BUTTON = "lcx-reset-button";
export const ID_SAVE_BUTTON = "lcx-save-button";

export const CSS_EDITOR_ROOT = "lcx-editor-root";
export const CSS_EDITOR_HEADER = "lcx-editor-header";
export const CSS_EDITOR_TABLE = "lcx-editor-table";
export const CSS_EDITOR_INPUT = "lcx-editor-input";
export const CSS_EDITOR_DELAY = "lcx-editor-delay";
export const CSS_EDITOR_BTN = "lcx-editor-btn";
export const CSS_EDITOR_BTN_PRIMARY = "lcx-editor-btn-primary";
export const CSS_EDITOR_BTN_GHOST = "lcx-editor-btn-ghost";

export const HEADER_KEY = "Key";
export const HEADER_XPATH = "XPath";
export const HEADER_DELAY = "Delay (ms)";
export const LABEL_RESET = "Reset to defaults";
export const LABEL_SAVE = "Save changes";
export const TITLE_EDITOR = "XPath / Delay editor";
