/**
 * Owner Switch popup — dark-theme stylesheet.
 *
 * Sibling CSS file per `mem://standards/standalone-scripts-css-in-own-file`.
 * No `!important`, no inline `<style>`, dark-only per
 * `mem://preferences/dark-only-theme`.
 */

const CSS_TEXT = `
.los-root { color: #e6e8eb; background: #1a1d21; padding: 16px; font: 13px/1.5 system-ui, sans-serif; min-width: 520px; }
.los-section { margin-bottom: 16px; padding: 12px; background: #23272d; border: 1px solid #2e333a; border-radius: 6px; }
.los-section h3 { margin: 0 0 8px; font-size: 13px; color: #9aa3ad; text-transform: uppercase; letter-spacing: 0.04em; }
.los-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
.los-label { font-size: 12px; color: #b8c0c8; }
.los-input { background: #1a1d21; color: #e6e8eb; border: 1px solid #3a4049; border-radius: 4px; padding: 6px 8px; font: inherit; }
.los-input:focus { outline: none; border-color: #5b8def; }
.los-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
.los-table th, .los-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #2e333a; font-size: 12px; }
.los-table th { color: #9aa3ad; font-weight: 500; }
.los-error-row { background: #3a1f22; }
.los-warning-row { background: #3a341f; }
.los-btn-primary { background: #5b8def; color: #fff; border: 0; padding: 8px 16px; border-radius: 4px; cursor: pointer; font: inherit; }
.los-btn-primary:hover { background: #4a7ad8; }
.los-btn-disabled { background: #3a4049; color: #9aa3ad; cursor: not-allowed; }
`.trim();

export const popupCss: string = CSS_TEXT;
