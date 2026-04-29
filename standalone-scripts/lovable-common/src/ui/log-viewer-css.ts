/**
 * Shared Logs Viewer — dark-theme stylesheet.
 *
 * Sibling CSS-in-string per `mem://standards/standalone-scripts-css-in-own-file`.
 * `lcl-` prefix prevents collision with `lcx-` (xpath editor) and
 * with host popup styles (`los-`, `lua-`). Step A / Step B phase
 * badges share the same neutral style — colour comes from severity,
 * not phase, so all phases are visually equal.
 */

const CSS_TEXT = `
.lcl-viewer-root { color: #e6e8eb; background: #23272d; padding: 12px; border: 1px solid #2e333a; border-radius: 6px; margin-top: 12px; }
.lcl-viewer-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.lcl-viewer-header h3 { margin: 0; font-size: 13px; color: #9aa3ad; text-transform: uppercase; letter-spacing: 0.04em; }
.lcl-viewer-filter { background: #1a1d21; color: #e6e8eb; border: 1px solid #3a4049; border-radius: 4px; padding: 4px 6px; font: inherit; }
.lcl-viewer-table { width: 100%; border-collapse: collapse; font: 11px monospace; }
.lcl-viewer-table th, .lcl-viewer-table td { text-align: left; padding: 3px 6px; border-bottom: 1px solid #2e333a; vertical-align: top; }
.lcl-viewer-table th { color: #9aa3ad; font-weight: 500; text-transform: uppercase; letter-spacing: 0.03em; }
.lcl-viewer-empty { color: #6b7280; font-style: italic; padding: 12px; text-align: center; }
.lcl-phase-badge { display: inline-block; padding: 1px 6px; background: #2e333a; color: #b8c0c8; border-radius: 3px; font-size: 10px; }
.lcl-sev-info { color: #9aa3ad; }
.lcl-sev-warn { color: #e0a440; }
.lcl-sev-error { color: #e25555; }
.lcl-viewer-btn { border: 0; padding: 6px 12px; border-radius: 4px; cursor: pointer; font: inherit; }
.lcl-viewer-btn-primary { background: #5b8def; color: #fff; }
.lcl-viewer-btn-primary:hover { background: #4a7ad8; }
`.trim();

export const logViewerCss: string = CSS_TEXT;
