/**
 * User Add popup — dark-theme stylesheet (sibling text constant).
 *
 * Mirrors Owner Switch's `popup-css.ts` with `lua-` prefix and adds
 * `.lua-select` + `.lua-normalized-badge` for the default-role dropdown
 * and the per-row "Editor→Member" indicator.
 *
 * No `!important`, dark-only per `mem://preferences/dark-only-theme`.
 */

const CSS_TEXT = `
.lua-root { color: #e6e8eb; background: #1a1d21; padding: 16px; font: 13px/1.5 system-ui, sans-serif; min-width: 560px; }
.lua-section { margin-bottom: 16px; padding: 12px; background: #23272d; border: 1px solid #2e333a; border-radius: 6px; }
.lua-section h3 { margin: 0 0 8px; font-size: 13px; color: #9aa3ad; text-transform: uppercase; letter-spacing: 0.04em; }
.lua-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.lua-label { font-size: 12px; color: #b8c0c8; }
.lua-input, .lua-select { background: #1a1d21; color: #e6e8eb; border: 1px solid #3a4049; border-radius: 4px; padding: 6px 8px; font: inherit; }
.lua-input:focus, .lua-select:focus { outline: none; border-color: #5b8def; }
.lua-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
.lua-table th, .lua-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #2e333a; font-size: 12px; }
.lua-table th { color: #9aa3ad; font-weight: 500; }
.lua-error-row { background: #3a1f22; }
.lua-normalized-badge { display: inline-block; margin-left: 6px; padding: 1px 6px; background: #2a3a52; color: #b8d0ff; border-radius: 3px; font-size: 10px; }
.lua-btn-primary { background: #5b8def; color: #fff; border: 0; padding: 8px 16px; border-radius: 4px; cursor: pointer; font: inherit; }
.lua-btn-primary:hover { background: #4a7ad8; }
.lua-btn-primary:disabled { background: #3a4049; color: #9aa3ad; cursor: not-allowed; }
`.trim();

export const popupCss: string = CSS_TEXT;
