/**
 * Settings Cog Button — v2.218.0
 *
 * Tiny ⚙️ button used by the panel header to open the settings modal.
 * Mirrors the visual weight of the auth/version badges so it doesn't
 * dominate the title bar.
 */

import { cPanelBorder } from './shared-state';
import { showSettingsModal } from './settings-modal';

export function buildSettingsButton(): HTMLElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.title = 'Marco Settings — edit grace period and refill threshold';
  btn.textContent = '⚙️';
  btn.style.cssText = 'background:rgba(100,116,139,0.18);color:#cbd5e1;border:1px solid ' + cPanelBorder + ';'
    + 'border-radius:4px;padding:1px 5px;font-size:11px;cursor:pointer;margin-right:4px;line-height:1;';
  btn.onclick = function (e: Event): void {
    e.stopPropagation();
    showSettingsModal();
  };
  return btn;
}
