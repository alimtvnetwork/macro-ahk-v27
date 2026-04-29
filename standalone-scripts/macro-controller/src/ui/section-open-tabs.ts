/**
 * MacroLoop Controller — Open Lovable Tabs Section
 *
 * Collapsible panel listing every currently open Lovable tab and the
 * project (workspace) it is bound to. Backed by the background handler
 * GET_OPEN_LOVABLE_TABS — the macro-controller runs in the MAIN world
 * and therefore cannot call chrome.tabs directly
 * (mem://architecture/injection-context-awareness).
 */

import { cPanelFgDim, cPrimaryLight } from '../shared-state';
import { createCollapsibleSection } from './section-collapsible';
import { sendToExtension } from './prompt-loader';
import { log, logSub } from '../logging';

export interface OpenTabsSectionResult {
    section: HTMLElement;
    refresh: () => void;
}

interface MatchedRuleInfoView {
    readonly pattern: string;
    readonly matchType: 'glob' | 'regex' | 'exact' | 'prefix';
    readonly origin: 'injection-record' | 'evaluated';
}

interface OpenLovableTabInfoView {
    readonly tabId: number | null;
    readonly title: string;
    readonly url: string;
    readonly active: boolean;
    readonly windowFocused: boolean;
    readonly projectId: string | null;
    readonly projectName: string | null;
    readonly bindingSource: 'injection' | 'probe' | 'none';
    readonly detectedWorkspaceName: string | null;
    readonly detectedWorkspaceId: string | null;
    readonly detectedWorkspaceSource: 'api' | 'cache' | 'dom' | 'none' | null;
    readonly probeError: string | null;
    readonly matchedRule: MatchedRuleInfoView | null;
}

interface OpenLovableTabsResponseView {
    readonly tabs?: ReadonlyArray<OpenLovableTabInfoView>;
    readonly capturedAt?: string;
    readonly isOk?: boolean;
    readonly errorMessage?: string;
}

const PANEL_ID = 'loop-open-tabs-panel';

function createRefreshButton(onRefresh: () => void): HTMLButtonElement {
    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.textContent = '⟳ Refresh';
    refreshBtn.style.cssText = 'margin-top:4px;padding:2px 8px;background:#1e3a5f;color:#cbd5e1;border:1px solid #3b6fa0;border-radius:3px;font-size:9px;cursor:pointer;';
    refreshBtn.onclick = function (e: Event): void {
        e.stopPropagation();
        onRefresh();
    };
    return refreshBtn;
}

function attachCopyDelegation(panel: HTMLElement): void {
    panel.addEventListener('click', function (e: Event): void {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const btn = target.closest('[data-copy-url]') as HTMLElement | null;
        if (!btn) return;
        e.stopPropagation();
        const url = btn.getAttribute('data-copy-url') ?? '';
        if (!url) return;
        void copyToClipboard(url, btn);
    });
}

export function createOpenTabsSection(): OpenTabsSectionResult {
    const col = createCollapsibleSection('🪟 Open Lovable Tabs', 'ml_collapse_open_tabs');

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = 'padding:4px;background:rgba(0,0,0,.5);border:1px solid #1e3a5f;border-radius:3px;max-height:160px;overflow-y:auto;';
    panel.innerHTML = renderEmpty('Click to load.');

    async function refresh(): Promise<void> {
        panel.innerHTML = renderEmpty('Loading…');
        try {
            const resp = await sendToExtension('GET_OPEN_LOVABLE_TABS', {}) as unknown as OpenLovableTabsResponseView;
            if (!resp || resp.isOk === false) {
                const reason = resp?.errorMessage ?? 'no response';
                panel.innerHTML = renderError(reason);
                return;
            }
            const tabs = Array.isArray(resp.tabs) ? resp.tabs : [];
            panel.innerHTML = renderList(tabs, resp.capturedAt);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            log('Open-tabs section refresh failed: ' + msg, 'warn');
            panel.innerHTML = renderError(msg);
        }
    }

    col.body.appendChild(panel);
    col.body.appendChild(createRefreshButton(function () { void refresh(); }));
    attachCopyDelegation(panel);

    // Auto-refresh on first expand and on each subsequent expand.
    const origClick = col.header.onclick as (() => void) | null;
    col.header.onclick = function (): void {
        if (origClick) origClick();
        const isVisible = col.body.style.display !== 'none';
        if (isVisible) void refresh();
    };

    const isInitiallyVisible = col.body.style.display !== 'none';
    if (isInitiallyVisible) void refresh();

    return { section: col.section, refresh: function (): void { void refresh(); } };
}

function renderEmpty(text: string): string {
    return '<div style="color:' + cPanelFgDim + ';font-size:10px;padding:4px;">' + escapeHtml(text) + '</div>';
}

function renderError(reason: string): string {
    return '<div style="color:#fca5a5;font-size:10px;padding:4px;">⚠ ' + escapeHtml(reason) + '</div>';
}

function renderList(tabs: ReadonlyArray<OpenLovableTabInfoView>, capturedAt: string | undefined): string {
    if (tabs.length === 0) {
        return renderEmpty('No Lovable tabs open.');
    }
    let html = '<div style="font-size:9px;color:' + cPrimaryLight + ';padding:2px 0 4px 0;">'
        + tabs.length + ' tab' + (tabs.length === 1 ? '' : 's')
        + (capturedAt ? ' · ' + escapeHtml(formatTime(capturedAt)) : '')
        + '</div>';
    for (const t of tabs) html += renderRow(t);
    return html;
}

function buildWorkspaceLabel(t: OpenLovableTabInfoView): string {
    if (t.projectName !== null) {
        const tag = t.bindingSource === 'probe'
            ? ' <span style="color:#9ca3af;font-size:8px;">(via probe)</span>'
            : '';
        return '<span style="color:#10b981;">' + escapeHtml(t.projectName) + '</span>' + tag;
    }
    if (t.detectedWorkspaceName) {
        const sourceTag = t.detectedWorkspaceSource
            ? ' <span style="color:#9ca3af;font-size:8px;">(' + escapeHtml(t.detectedWorkspaceSource) + ')</span>'
            : '';
        return '<span style="color:#fbbf24;">' + escapeHtml(t.detectedWorkspaceName) + '</span>' + sourceTag;
    }
    const reason = t.probeError
        ? 'no controller (' + t.probeError + ')'
        : (t.bindingSource === 'injection' ? 'unknown project' : 'not bound');
    const truncated = reason.length > 40 ? reason.slice(0, 40) + '…' : reason;
    return '<span style="color:#9ca3af;font-style:italic;" title="' + escapeHtml(reason) + '">'
        + escapeHtml(truncated)
        + '</span>';
}

function renderRow(t: OpenLovableTabInfoView): string {
    const titleSafe = escapeHtml(t.title || '(untitled)');
    const urlSafe = escapeHtml(shortenUrl(t.url));
    const wsLabel = buildWorkspaceLabel(t);

    const activeBadge = t.active
        ? '<span style="color:#fbbf24;margin-right:4px;" title="Active in window">●</span>'
        : '';
    const focusBadge = t.windowFocused
        ? '<span style="color:#60a5fa;margin-right:4px;" title="Focused window">◆</span>'
        : '';
    const whyLine = renderWhyLine(t);

    const copyBtn = ''
        + '<button type="button" data-copy-url="' + escapeHtml(t.url) + '" '
        +   'title="Copy tab URL to clipboard" '
        +   'style="margin-left:4px;padding:1px 6px;background:#1e3a5f;color:#cbd5e1;border:1px solid #3b6fa0;border-radius:3px;font-size:9px;cursor:pointer;flex-shrink:0;">'
        +   '⎘ Copy'
        + '</button>';

    return ''
        + '<div style="font-size:10px;font-family:monospace;padding:3px 4px;border-top:1px solid rgba(255,255,255,0.06);">'
        +   '<div style="display:flex;align-items:center;gap:4px;">'
        +     focusBadge + activeBadge
        +     '<span style="color:#e2e8f0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(t.title) + '">' + titleSafe + '</span>'
        +     copyBtn
        +   '</div>'
        +   '<div style="color:' + cPanelFgDim + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(t.url) + '">' + urlSafe + '</div>'
        +   '<div style="color:#9ca3af;">↳ workspace: ' + wsLabel + '</div>'
        +   whyLine
        + '</div>';
}

async function copyToClipboard(url: string, btn: HTMLElement): Promise<void> {
    const originalText = btn.textContent ?? '⎘ Copy';
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(url);
        } else {
            const ta = document.createElement('textarea');
            ta.value = url;
            ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0;';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            if (!ok) throw new Error('execCommand("copy") returned false');
        }
        btn.textContent = '✓ Copied';
        btn.style.background = '#065f46';
        window.setTimeout(function (): void {
            btn.textContent = originalText;
            btn.style.background = '#1e3a5f';
        }, 1200);
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log('Copy URL failed: ' + msg, 'warn');
        btn.textContent = '✗ Failed';
        btn.style.background = '#7f1d1d';
        window.setTimeout(function (): void {
            btn.textContent = originalText;
            btn.style.background = '#1e3a5f';
        }, 1500);
    }
}

/**
 * Renders the "why this binding?" diagnostic line, e.g.
 *   ↳ via injection · glob "https://*.lovable.app/*"
 *   ↳ via probe · evaluated · regex "^https://lovable\\.dev/projects/.+"
 *   ↳ via none (no project rule matched)
 */
function renderWhyLine(t: OpenLovableTabInfoView): string {
    const sourceLabel = t.bindingSource === 'injection'
        ? '<span style="color:#10b981;">injection</span>'
        : t.bindingSource === 'probe'
            ? '<span style="color:#fbbf24;">probe</span>'
            : '<span style="color:#9ca3af;">none</span>';

    let ruleLabel: string;
    if (t.matchedRule !== null) {
        const originTag = t.matchedRule.origin === 'injection-record'
            ? ''
            : ' <span style="color:#9ca3af;font-size:8px;">(evaluated)</span>';
        const patternSafe = escapeHtml(t.matchedRule.pattern);
        const patternShort = t.matchedRule.pattern.length > 50
            ? escapeHtml(t.matchedRule.pattern.slice(0, 50) + '…')
            : patternSafe;
        ruleLabel = ''
            + '<span style="color:#9ca3af;">' + escapeHtml(t.matchedRule.matchType) + '</span> '
            + '<span style="color:#cbd5e1;" title="' + patternSafe + '">"' + patternShort + '"</span>'
            + originTag;
    } else {
        ruleLabel = '<span style="color:#9ca3af;font-style:italic;">no project rule matched</span>';
    }

    return '<div style="color:#9ca3af;font-size:9px;">↳ via ' + sourceLabel + ' · ' + ruleLabel + '</div>';
}

function shortenUrl(url: string): string {
    try {
        const u = new URL(url);
        return u.host + u.pathname;
    } catch (e) {
        logSub('shortenUrl failed: ' + (e instanceof Error ? e.message : String(e)), 1);
        return url;
    }
}

function formatTime(iso: string): string {
    try { return new Date(iso).toLocaleTimeString(); } catch { return iso; }
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
