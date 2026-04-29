/**
 * ws-hover-card — Refill section tests (v2.224.0)
 *
 * Verifies the "Estimated next refill" + "Warning starts on" lines added to
 * the Refill section of the workspace hover card. The "Warning starts on"
 * line is a calendar projection of the active refillWarningThresholdDays
 * threshold, so users can see exactly when the About-To-Refill pill will
 * trigger.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildWorkspaceHoverHtml } from '../ws-hover-card';
import { getEffectiveStatus } from '../workspace-status';
import type { WorkspaceCredit } from '../types';
import type { WorkspaceLifecycleConfig } from '../workspace-lifecycle-config';

const NOW = Date.parse('2026-04-22T00:00:00Z');
const MS_PER_DAY = 86_400_000;

// Freeze the system clock so relative-time formatters (Date.now()) inside
// ws-hover-card.ts produce deterministic projections (Warning starts on, etc.).
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); });
afterAll(() => { vi.useRealTimers(); });

function cfg(refillWarn: number): WorkspaceLifecycleConfig {
  return {
    expiryGracePeriodDays: 30,
    refillWarningThresholdDays: refillWarn,
    enableWorkspaceStatusLabels: true,
    enableWorkspaceHoverDetails: true,
  };
}

function isoDaysAhead(d: number): string {
  return new Date(NOW + d * MS_PER_DAY).toISOString();
}

function makeWs(overrides: Partial<WorkspaceCredit>): WorkspaceCredit {
  return {
    id: 'ws_r', name: 'R', fullName: 'R Workspace',
    dailyFree: 5, dailyUsed: 0, dailyLimit: 5,
    rolloverUsed: 0, rolloverLimit: 0,
    freeGranted: 0, freeRemaining: 0,
    used: 0, limit: 100, topupLimit: 0,
    totalCredits: 100, available: 50, rollover: 0, billingAvailable: 30,
    hasFree: false, totalCreditsUsed: 0,
    subscriptionStatus: 'active', subscriptionStatusChangedAt: '',
    plan: 'pro_1', role: 'owner', tier: 'PRO',
    raw: {}, rawApi: {},
    numProjects: 1, gitSyncEnabled: false,
    nextRefillAt: '', billingPeriodEndAt: '',
    createdAt: '2025-01-15T00:00:00Z',
    membershipRole: 'Owner', planType: 'PRO',
    ...overrides,
  };
}

/** Slice the Refill *section* (header + rows) out of the hover-card HTML.
 *  Anchored on the section-header style signature so it doesn't accidentally
 *  pick up the "About To Refill" pill in the title bar.
 */
function extractRefillSection(html: string): string {
  const HEADER_MARKER = 'font-size:9px;font-weight:700;letter-spacing:0.6px';
  let cursor = 0;
  while (cursor < html.length) {
    const headerStart = html.indexOf(HEADER_MARKER, cursor);
    if (headerStart === -1) return '';
    const sectionOpen = html.lastIndexOf('<div', headerStart);
    const headerCloseIdx = html.indexOf('</div>', headerStart);
    if (headerCloseIdx === -1) return '';
    const headerBlock = html.slice(headerStart, headerCloseIdx + 6);
    if (headerBlock.includes('>Refill</div>')) {
      const nextHeaderIdx = html.indexOf(HEADER_MARKER, headerCloseIdx);
      return nextHeaderIdx === -1
        ? html.slice(sectionOpen)
        : html.slice(sectionOpen, html.lastIndexOf('<div', nextHeaderIdx));
    }
    cursor = headerCloseIdx + 6;
  }
  return '';
}

describe('Refill section — Estimated next refill', () => {
  it('shows Estimated next refill from nextRefillAt when not in warning window', () => {
    const ws = makeWs({ nextRefillAt: isoDaysAhead(20) });
    const status = getEffectiveStatus(ws, cfg(7), NOW);
    const html = buildWorkspaceHoverHtml(ws, status, cfg(7));
    const section = extractRefillSection(html);
    expect(section).toContain('Estimated next refill');
    expect(section).toMatch(/\d{2} \w{3} \d{2}/);
    expect(section).toContain('in ');
    // Should NOT carry the [from billing_period_end] tag.
    expect(section).not.toContain('billing_period_end');
  });

  it('falls back to billingPeriodEndAt when nextRefillAt missing, with source tag', () => {
    const ws = makeWs({ nextRefillAt: '', billingPeriodEndAt: isoDaysAhead(15) });
    const status = getEffectiveStatus(ws, cfg(7), NOW);
    const html = buildWorkspaceHoverHtml(ws, status, cfg(7));
    const section = extractRefillSection(html);
    expect(section).toContain('Estimated next refill');
    expect(section).toContain('[from billing_period_end]');
  });

  it('omits Refill section entirely when no refill source is available', () => {
    const ws = makeWs({ nextRefillAt: '', billingPeriodEndAt: '' });
    const status = getEffectiveStatus(ws, cfg(7), NOW);
    const html = buildWorkspaceHoverHtml(ws, status, cfg(7));
    expect(html).not.toMatch(/>Refill</);
  });
});

describe('Refill section — Warning starts on (threshold projection)', () => {
  it('shows Warning starts on as estimateIso − refillWarningThresholdDays', () => {
    const ws = makeWs({ nextRefillAt: isoDaysAhead(20) });
    const status = getEffectiveStatus(ws, cfg(7), NOW);
    const html = buildWorkspaceHoverHtml(ws, status, cfg(7));
    const section = extractRefillSection(html);
    expect(section).toContain('Warning starts on');
    expect(section).toContain('−7d'); // negative-day shorthand
    // 20 days from NOW − 7 days = 13 days from NOW → "in 13d".
    expect(section).toContain('in 13d');
  });

  it('marks "active now" when warning window has already opened', () => {
    const ws = makeWs({ nextRefillAt: isoDaysAhead(3) });
    const status = getEffectiveStatus(ws, cfg(7), NOW);
    const html = buildWorkspaceHoverHtml(ws, status, cfg(7));
    const section = extractRefillSection(html);
    expect(section).toContain('Warning starts on');
    expect(section).toContain('active now');
  });

  it('reflects user-overridden refillWarningThresholdDays', () => {
    const ws = makeWs({ nextRefillAt: isoDaysAhead(20) });
    const status = getEffectiveStatus(ws, cfg(14), NOW);
    const html = buildWorkspaceHoverHtml(ws, status, cfg(14));
    const section = extractRefillSection(html);
    expect(section).toContain('−14d');
    // 20 − 14 = 6 days from NOW.
    expect(section).toContain('in 6d');
  });

  it('omits Warning starts on when threshold is 0', () => {
    const ws = makeWs({ nextRefillAt: isoDaysAhead(20) });
    const status = getEffectiveStatus(ws, cfg(0), NOW);
    const html = buildWorkspaceHoverHtml(ws, status, cfg(0));
    const section = extractRefillSection(html);
    expect(section).toContain('Estimated next refill');
    expect(section).not.toContain('Warning starts on');
  });
});
