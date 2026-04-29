/**
 * Shared XPath Editor — dark-theme stylesheet.
 *
 * Sibling CSS-in-string file per `mem://standards/standalone-scripts-css-in-own-file`.
 * No `!important`, no inline `<style>`, dark-only theme. The `lcx-`
 * prefix prevents leaking into host popup styles.
 */

const CSS_TEXT = `
.lcx-editor-root { color: #e6e8eb; background: #23272d; padding: 12px; border: 1px solid #2e333a; border-radius: 6px; margin-top: 12px; }
.lcx-editor-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.lcx-editor-header h3 { margin: 0; font-size: 13px; color: #9aa3ad; text-transform: uppercase; letter-spacing: 0.04em; }
.lcx-editor-table { width: 100%; border-collapse: collapse; }
.lcx-editor-table th, .lcx-editor-table td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #2e333a; font-size: 12px; vertical-align: middle; }
.lcx-editor-table th { color: #9aa3ad; font-weight: 500; }
.lcx-editor-input { width: 100%; background: #1a1d21; color: #e6e8eb; border: 1px solid #3a4049; border-radius: 4px; padding: 4px 6px; font: 12px monospace; }
.lcx-editor-delay { width: 80px; background: #1a1d21; color: #e6e8eb; border: 1px solid #3a4049; border-radius: 4px; padding: 4px 6px; font: inherit; }
.lcx-editor-input:focus, .lcx-editor-delay:focus { outline: none; border-color: #5b8def; }
.lcx-editor-btn { border: 0; padding: 6px 12px; border-radius: 4px; cursor: pointer; font: inherit; margin-left: 6px; }
.lcx-editor-btn-primary { background: #5b8def; color: #fff; }
.lcx-editor-btn-primary:hover { background: #4a7ad8; }
.lcx-editor-btn-ghost { background: #2e333a; color: #b8c0c8; }
.lcx-editor-btn-ghost:hover { background: #3a4049; }
`.trim();

export const xpathEditorCss: string = CSS_TEXT;
