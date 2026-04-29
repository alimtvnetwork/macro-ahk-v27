/**
 * User Add popup — public barrel.
 *
 * P14 surface: `mountPopup(host)` + role-option constants for the
 * shared XPath/delay editor (P18) which may want to reuse the option
 * list.
 */

export { mountPopup } from "./popup-shell";
export { DEFAULT_ROLE_OPTIONS, DEFAULT_ROLE_VALUE } from "./popup-role-options";
export type { RoleOption } from "./popup-role-options";
export * from "./popup-constants";
