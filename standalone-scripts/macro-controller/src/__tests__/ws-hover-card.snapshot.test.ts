/**
 * Hover card snapshot tests — verifies that `buildWorkspaceHoverHtml`
 * renders the Subscription section correctly for the three primary
 * subscription_status values: active, past_due, and canceled.
 *
 * Snapshots cover the full hover-card markup, but the assertions also
 * pin the Subscription section's structure (header, status row, changed
 * row) explicitly so a regression in just that section fails loudly.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { buildWorkspaceHoverHtml } from '../ws-hover-card';
import { getEffectiveStatus } from '../workspace-status';
import type { WorkspaceCredit } from '../types';
import type { WorkspaceLifecycleConfig } from '../workspace-lifecycle-config';

const NOW = Date.parse('2026-04-22T00:00:00Z');
const MS_PER_DAY = 86_400_000;

// Freeze the system clock so relative-time formatters (Date.now()) inside
// ws-hover-card.ts and workspace-status.ts produce deterministic output.
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); });
afterAll(() => { vi.useRealTimers(); });

const CFG: WorkspaceLifecycleConfig = {
  expiryGracePeriodDays: 30,
  refillWarningThresholdDays: 7,
  enableWorkspaceStatusLabels: true,
  enableWorkspaceHoverDetails: true,
};

function isoDaysAgo(d: number): string {
  return new Date(NOW - d * MS_PER_DAY).toISOString();
}

function makeWs(overrides: Partial<WorkspaceCredit>): WorkspaceCredit {
  return {
    id: 'ws_snap', name: 'Snap', fullName: 'Snap Workspace',
    dailyFree: 5, dailyUsed: 0, dailyLimit: 5,
    rolloverUsed: 0, rolloverLimit: 0,
    freeGranted: 0, freeRemaining: 0,
    used: 0, limit: 100, topupLimit: 0,
    totalCredits: 100, available: 50, rollover: 0, billingAvailable: 30,
    hasFree: false, totalCreditsUsed: 0,
    subscriptionStatus: 'active', subscriptionStatusChangedAt: '',
    plan: 'pro_1', role: 'owner', tier: 'PRO',
    raw: {}, rawApi: {},
    numProjects: 3, gitSyncEnabled: false,
    nextRefillAt: '', billingPeriodEndAt: '',
    createdAt: '2025-01-15T00:00:00Z',
    membershipRole: 'Owner', planType: 'PRO',
    ...overrides,
  };
}

/**
 * Extract the Subscription section as a discrete chunk so snapshots focus on
 * the section under test. The hover card uses
 * `font-size:9px;...text-transform:uppercase` on every section header — we
 * locate the "Subscription" header and grab the markup until the next header
 * (or end of card).
 */
function extractSubscriptionSection(html: string): string {
  const headerToken = 'Subscription';
  const headerIdx = html.indexOf(headerToken);
  if (headerIdx === -1) return '';
  // Walk back to the start of the surrounding <div ...>Subscription</div>.
  const sectionOpen = html.lastIndexOf('<div', headerIdx);
  if (sectionOpen === -1) return '';
  // Find the next section header div (font-size:9px ... uppercase) or end.
  const NEXT_HEADER_MARKER = 'font-size:9px;font-weight:700';
  const nextHeaderIdx = html.indexOf(NEXT_HEADER_MARKER, headerIdx + headerToken.length);
  return nextHeaderIdx === -1
    ? html.slice(sectionOpen)
    : html.slice(sectionOpen, html.lastIndexOf('<div', nextHeaderIdx));
}

describe('ws-hover-card — Subscription section snapshots', () => {
  it('renders Subscription section for active status', () => {
    const ws = makeWs({
      subscriptionStatus: 'active',
      subscriptionStatusChangedAt: isoDaysAgo(45),
    });
    const status = getEffectiveStatus(ws, CFG, NOW);
    const html = buildWorkspaceHoverHtml(ws, status, CFG);
    const section = extractSubscriptionSection(html);

    // Pin structural expectations:
    expect(section).toContain('Subscription');
    expect(section).toContain('Status');
    expect(section).toContain('active');
    // Active uses success green (#34d399).
    expect(section).toContain('#34d399');
    // Changed line should appear with formatted date.
    expect(section).toContain('Changed');
    expect(section).toMatch(/\d{2} \w{3} \d{2}/);
    // Snapshot for full regression coverage.
    expect(section).toMatchSnapshot();
  });

  it('renders Subscription section for past_due status', () => {
    const ws = makeWs({
      subscriptionStatus: 'past_due',
      subscriptionStatusChangedAt: isoDaysAgo(3),
    });
    const status = getEffectiveStatus(ws, CFG, NOW);
    const html = buildWorkspaceHoverHtml(ws, status, CFG);
    const section = extractSubscriptionSection(html);

    expect(section).toContain('Subscription');
    expect(section).toContain('past_due');
    // past_due uses warning yellow (#fde68a).
    expect(section).toContain('#fde68a');
    expect(section).toContain('Changed');
    expect(section).toMatchSnapshot();
  });

  it('renders Subscription section for canceled status', () => {
    const ws = makeWs({
      subscriptionStatus: 'canceled',
      subscriptionStatusChangedAt: isoDaysAgo(10),
      tier: 'EXPIRED',
    });
    const status = getEffectiveStatus(ws, CFG, NOW);
    const html = buildWorkspaceHoverHtml(ws, status, CFG);
    const section = extractSubscriptionSection(html);

    expect(section).toContain('Subscription');
    expect(section).toContain('canceled');
    // canceled uses error red (#fca5a5).
    expect(section).toContain('#fca5a5');
    expect(section).toContain('Changed');
    expect(section).toMatchSnapshot();
  });

  it('omits Subscription section when neither status nor changedAt are set', () => {
    const ws = makeWs({ subscriptionStatus: '', subscriptionStatusChangedAt: '' });
    const status = getEffectiveStatus(ws, CFG, NOW);
    const html = buildWorkspaceHoverHtml(ws, status, CFG);
    // Section header should not be present.
    expect(html).not.toMatch(/>Subscription</);
  });

  it('renders Status row only when changedAt is missing', () => {
    const ws = makeWs({ subscriptionStatus: 'active', subscriptionStatusChangedAt: '' });
    const status = getEffectiveStatus(ws, CFG, NOW);
    const html = buildWorkspaceHoverHtml(ws, status, CFG);
    const section = extractSubscriptionSection(html);
    expect(section).toContain('Status');
    expect(section).toContain('active');
    expect(section).not.toContain('Changed');
  });
});

describe('ws-hover-card — full markup snapshot per status', () => {
  it.each([
    ['active', { subscriptionStatus: 'active', subscriptionStatusChangedAt: isoDaysAgo(45) }],
    ['past_due', { subscriptionStatus: 'past_due', subscriptionStatusChangedAt: isoDaysAgo(3) }],
    ['canceled', { subscriptionStatus: 'canceled', subscriptionStatusChangedAt: isoDaysAgo(10), tier: 'EXPIRED' }],
  ])('full hover-card markup snapshot — %s', (_label, partial) => {
    const ws = makeWs(partial as Partial<WorkspaceCredit>);
    const status = getEffectiveStatus(ws, CFG, NOW);
    const html = buildWorkspaceHoverHtml(ws, status, CFG);
    expect(html).toMatchSnapshot();
  });
});
