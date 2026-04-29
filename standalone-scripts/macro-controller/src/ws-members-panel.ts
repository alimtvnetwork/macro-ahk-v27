/**
 * Workspace Members Panel — v2.216.0
 *
 * Floating panel that lists active members of a workspace, opened from the
 * right-click context menu on a workspace row. Single shared mount point
 * (`#marco-ws-members-panel`) — calling `showWsMembersPanel` re-uses the
 * existing element, repositions it, and re-renders the body.
 *
 * Lifecycle:
 *   showWsMembersPanel(wsId, wsName, x, y)
 *     → render loading → fetch → render success / error
 *     → click outside / Esc → hide
 *
 * Renders all 8 fields per member, with a header showing the workspace name +
 * total member count and a refresh button. Sorted by `total_credits_used`
 * descending (handled in `ws-members-fetch.ts`).
 */

import { cPanelBg, cPanelFg, cPanelBorder, cPrimary, cPrimaryLight, lDropdownRadius } from './shared-state';
import { fetchWorkspaceMembers, clearMembersCache, type WorkspaceMember } from './ws-members-fetch';
import { logError } from './error-utils';
import { formatDateDDMMMYY } from './workspace-status';

const PANEL_ID = 'marco-ws-members-panel';
const Z_INDEX = 100002;

/* ------------------------------------------------------------------ */
/*  HTML helpers                                                       */
/* ------------------------------------------------------------------ */

function escHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  // Show up to 2 decimals only when fractional part is non-trivial.
  return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}

function roleBadge(role: string): string {
  const norm = role.toLowerCase();
  let color = '#94a3b8';
  let bg = 'rgba(148,163,184,0.15)';
  if (norm === 'admin' || norm === 'owner') {
    color = '#fde68a';
    bg = 'rgba(180,83,9,0.35)';
  } else if (norm === 'editor' || norm === 'developer') {
    color = '#bae6fd';
    bg = 'rgba(2,132,199,0.30)';
  } else if (norm === 'viewer') {
    color = '#cbd5e1';
    bg = 'rgba(71,85,105,0.30)';
  }
  return '<span style="font-size:9px;color:' + color
    + ';background:' + bg
    + ';padding:1px 5px;border-radius:3px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;">'
    + escHtml(role || 'member') + '</span>';
}

function memberRowHtml(m: WorkspaceMember, idx: number): string {
  const displayName = m.display_name || m.username || m.email || m.user_id;
  const credits = fmtNumber(m.total_credits_used);
  const billingCredits = fmtNumber(m.total_credits_used_in_billing_period);
  const joined = m.joined_at ? formatDateDDMMMYY(m.joined_at) : '—';
  const invited = m.invited_at ? formatDateDDMMMYY(m.invited_at) : '—';

  return '<div style="display:flex;flex-direction:column;gap:2px;padding:6px 8px;border-bottom:1px solid rgba(148,163,184,0.12);font-size:11px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">'
    +   '<div style="display:flex;align-items:center;gap:6px;min-width:0;">'
    +     '<span style="color:#64748b;font-size:10px;width:18px;text-align:right;flex-shrink:0;">' + (idx + 1) + '.</span>'
    +     '<span style="color:#f1f5f9;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escHtml(displayName) + '</span>'
    +     roleBadge(m.role)
    +   '</div>'
    +   '<span style="color:#34d399;font-weight:700;font-variant-numeric:tabular-nums;flex-shrink:0;" title="Total credits used (all time)">' + credits + ' cr</span>'
    + '</div>'
    + '<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;color:#94a3b8;">'
    +   '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escHtml(m.email) + '">' + escHtml(m.email || '—') + '</span>'
    +   '<span title="Credits used this billing period">Period: ' + billingCredits + '</span>'
    + '</div>'
    + '<div style="display:flex;justify-content:space-between;gap:8px;font-size:9px;color:#64748b;">'
    +   '<span title="@username · user_id ' + escHtml(m.user_id) + '">@' + escHtml(m.username || '—') + '</span>'
    +   '<span>Joined ' + escHtml(joined) + ' · Invited ' + escHtml(invited) + '</span>'
    + '</div>'
    + '</div>';
}

function buildBodyHtml(state: PanelState): string {
  if (state.kind === 'loading') {
    return '<div style="padding:14px;text-align:center;color:#94a3b8;font-size:11px;">⏳ Loading members…</div>';
  }
  if (state.kind === 'error') {
    return '<div style="padding:12px;color:#fca5a5;font-size:11px;line-height:1.4;">'
      + '<div style="font-weight:700;margin-bottom:4px;">❌ Failed to load members</div>'
      + '<div style="color:#cbd5e1;font-family:monospace;font-size:10px;word-break:break-word;">' + escHtml(state.error) + '</div>'
      + '</div>';
  }
  if (state.members.length === 0) {
    return '<div style="padding:14px;text-align:center;color:#94a3b8;font-size:11px;">No active members.</div>';
  }
  const rows = state.members.map(function (m, i) { return memberRowHtml(m, i); }).join('');
  return '<div style="max-height:380px;overflow-y:auto;">' + rows + '</div>';
}

function headerHtml(wsName: string, state: PanelState): string {
  let countText = '';
  if (state.kind === 'success') {
    countText = state.members.length === state.total
      ? state.members.length + ' member' + (state.members.length === 1 ? '' : 's')
      : 'top ' + state.members.length + ' of ' + state.total;
  } else if (state.kind === 'loading') {
    countText = '…';
  } else {
    countText = 'error';
  }
  return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid ' + cPanelBorder + ';background:rgba(0,0,0,0.25);">'
    + '<div style="min-width:0;">'
    +   '<div style="font-size:12px;font-weight:700;color:#f1f5f9;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">👥 ' + escHtml(wsName) + '</div>'
    +   '<div style="font-size:9px;color:#94a3b8;letter-spacing:0.3px;text-transform:uppercase;">' + countText + ' · sorted by credits used</div>'
    + '</div>'
    + '<div style="display:flex;gap:4px;flex-shrink:0;">'
    +   '<button type="button" data-marco-action="refresh" title="Refresh"'
    +     ' style="background:rgba(0,122,204,0.25);color:#bae6fd;border:1px solid ' + cPrimary + ';border-radius:3px;padding:2px 6px;font-size:11px;cursor:pointer;line-height:1;">↻</button>'
    +   '<button type="button" data-marco-action="close" title="Close (Esc)"'
    +     ' style="background:rgba(100,116,139,0.35);color:#e2e8f0;border:1px solid ' + cPanelBorder + ';border-radius:3px;padding:2px 7px;font-size:11px;cursor:pointer;line-height:1;">✕</button>'
    + '</div>'
    + '</div>';
}

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

interface PanelStateLoading { kind: 'loading'; }
interface PanelStateError { kind: 'error'; error: string; }
interface PanelStateSuccess { kind: 'success'; members: WorkspaceMember[]; total: number; }
type PanelState = PanelStateLoading | PanelStateError | PanelStateSuccess;

/* ------------------------------------------------------------------ */
/*  DOM lifecycle                                                      */
/* ------------------------------------------------------------------ */

interface PanelHandlerStore {
  _marcoMembersOutsideClick?: (e: MouseEvent) => void;
  _marcoMembersKey?: (e: KeyboardEvent) => void;
}

function ensurePanelEl(): HTMLDivElement {
  let el = document.getElementById(PANEL_ID) as HTMLDivElement | null;
  if (el) return el;
  el = document.createElement('div');
  el.id = PANEL_ID;
  el.style.cssText = [
    'position:fixed', 'z-index:' + Z_INDEX,
    'min-width:300px', 'max-width:420px',
    'background:' + cPanelBg, 'color:' + cPanelFg,
    'border:1px solid ' + cPrimaryLight,
    'border-radius:' + lDropdownRadius,
    'box-shadow:0 12px 32px rgba(0,0,0,0.6)',
    'font-family:system-ui,-apple-system,sans-serif', 'font-size:11px',
    'display:none',
  ].join(';') + ';';
  document.body.appendChild(el);
  return el;
}

function positionPanel(el: HTMLElement, x: number, y: number): void {
  el.style.visibility = 'hidden';
  el.style.display = 'block';
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x;
  let top = y;
  if (left + r.width > vw - 8) left = Math.max(8, vw - r.width - 8);
  if (top + r.height > vh - 8) top = Math.max(8, vh - r.height - 8);
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.visibility = 'visible';
}

function render(el: HTMLElement, wsName: string, state: PanelState): void {
  el.innerHTML = headerHtml(wsName, state) + buildBodyHtml(state);
}

function attachActionHandlers(el: HTMLElement, wsId: string, wsName: string): void {
  el.onclick = function (e: MouseEvent): void {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    const action = target.getAttribute('data-marco-action');
    if (action === 'close') {
      e.stopPropagation();
      hideWsMembersPanel();
    } else if (action === 'refresh') {
      e.stopPropagation();
      clearMembersCache(wsId);
      loadAndRender(el, wsId, wsName);
    }
  };
}

function attachDismissHandlers(el: HTMLElement): void {
  const store = el as HTMLElement & PanelHandlerStore;
  if (store._marcoMembersOutsideClick) {
    document.removeEventListener('mousedown', store._marcoMembersOutsideClick, true);
  }
  if (store._marcoMembersKey) {
    document.removeEventListener('keydown', store._marcoMembersKey, true);
  }

  const outside = function (e: MouseEvent): void {
    const t = e.target as Node | null;
    if (!t) return;
    if (el.contains(t)) return;
    hideWsMembersPanel();
  };
  const key = function (e: KeyboardEvent): void {
    if (e.key === 'Escape') hideWsMembersPanel();
  };

  store._marcoMembersOutsideClick = outside;
  store._marcoMembersKey = key;
  // Defer attach by a tick so the opening right-click doesn't immediately dismiss.
  setTimeout(function () {
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', key, true);
  }, 10);
}

function detachDismissHandlers(): void {
  const el = document.getElementById(PANEL_ID);
  if (!el) return;
  const store = el as HTMLElement & PanelHandlerStore;
  if (store._marcoMembersOutsideClick) {
    document.removeEventListener('mousedown', store._marcoMembersOutsideClick, true);
    delete store._marcoMembersOutsideClick;
  }
  if (store._marcoMembersKey) {
    document.removeEventListener('keydown', store._marcoMembersKey, true);
    delete store._marcoMembersKey;
  }
}

/* ------------------------------------------------------------------ */
/*  Async load                                                         */
/* ------------------------------------------------------------------ */

function loadAndRender(el: HTMLElement, wsId: string, wsName: string): void {
  render(el, wsName, { kind: 'loading' });
  fetchWorkspaceMembers(wsId)
    .then(function (entry) {
      if (!document.getElementById(PANEL_ID)) return; // panel was closed
      render(el, wsName, { kind: 'success', members: entry.members, total: entry.total });
    })
    .catch(function (err: unknown) {
      if (!document.getElementById(PANEL_ID)) return;
      const msg = err instanceof Error ? err.message : String(err);
      logError('WsMembersPanel', 'Members fetch failed for ' + wsId + ': ' + msg);
      render(el, wsName, { kind: 'error', error: msg });
    });
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Open the members panel for a workspace at the given screen coords. */
export function showWsMembersPanel(wsId: string, wsName: string, x: number, y: number): void {
  if (!wsId) return;
  const el = ensurePanelEl();
  // Reset attach state before re-rendering for a different workspace.
  detachDismissHandlers();
  attachActionHandlers(el, wsId, wsName);
  loadAndRender(el, wsId, wsName);
  // First render to measure, then position.
  positionPanel(el, x, y);
  attachDismissHandlers(el);
}

/** Hide and detach listeners. Safe to call when panel is not mounted. */
export function hideWsMembersPanel(): void {
  detachDismissHandlers();
  const el = document.getElementById(PANEL_ID);
  if (el) el.style.display = 'none';
}
