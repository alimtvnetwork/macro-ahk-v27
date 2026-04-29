/**
 * MacroLoop Controller — Database Schema Helpers
 *
 * Shared DOM and display utilities for the schema tab modules.
 * Extracted from database-schema-tab.ts during Phase 5 module splitting.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

/** Create a typed DOM element with optional class and text. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  textContent?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);

  const hasClassName = className !== undefined;

  if (hasClassName) {
    element.className = className;
  }

  const hasTextContent = textContent !== undefined;

  if (hasTextContent) {
    element.textContent = textContent;
  }

  return element;
}

/** Escape HTML entities for safe insertion. */
export function escHtml(text: string): string {
  const container = document.createElement('div');
  container.textContent = text;
  return container.innerHTML;
}

/** Show a success or error message in the given area. */
export function showMsg(area: HTMLElement, type: 'ok' | 'err', text: string): void {
  area.textContent = '';
  const isSuccess = type === 'ok';
  const cssClass = isSuccess ? 'marco-schema-msg-ok' : 'marco-schema-msg-err';
  const message = el('div', 'marco-schema-msg ' + cssClass, text);
  area.appendChild(message);

  if (isSuccess) {
    setTimeout(() => { message.remove(); }, 4000);
  }
}
