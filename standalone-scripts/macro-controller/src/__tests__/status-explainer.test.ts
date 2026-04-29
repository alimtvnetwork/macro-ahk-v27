/**
 * Unit tests for status-explainer.ts
 *
 * Verifies that `explainEffectiveStatus()` (the debug-trace variant) stays in
 * lockstep with `getEffectiveStatus()` and produces a coherent rule trace
 * across the same threshold variations exercised by
 * workspace-status-transitions.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { explainEffectiveStatus } from '../status-explainer';
import { getEffectiveStatus } from '../workspace-status';
import type { WorkspaceCredit } from '../types';
import type { WorkspaceLifecycleConfig } from '../workspace-lifecycle-config';

const NOW = Date.parse('2026-04-22T00:00:00Z');
const MS_PER_DAY = 86_400_000;

function cfg(grace: number, refill: number): WorkspaceLifecycleConfig {
  return {
    expiryGracePeriodDays: grace,
    refillWarningThresholdDays: refill,
    enableWorkspaceStatusLabels: true,
    enableWorkspaceHoverDetails: true,
  };
}

function isoDaysAgo(d: number): string {
  return new Date(NOW - d * MS_PER_DAY).toISOString();
}

function isoDaysAhead(d: number): string {
  return new Date(NOW + d * MS_PER_DAY + 1).toISOString();
}

function makeWs(overrides: Partial<WorkspaceCredit>): WorkspaceCredit {
  return {
    id: 'ws_x', name: 'X', fullName: 'X',
    dailyFree: 0, dailyUsed: 0, dailyLimit: 0,
    rolloverUsed: 0, rolloverLimit: 0,
    freeGranted: 0, freeRemaining: 0,
    used: 0, limit: 0, topupLimit: 0,
    totalCredits: 0, available: 0, rollover: 0, billingAvailable: 0,
    hasFree: false, totalCreditsUsed: 0,
    subscriptionStatus: 'active', subscriptionStatusChangedAt: '',
    plan: 'pro_1', role: 'owner', tier: 'PRO',
    raw: {}, rawApi: {},
    numProjects: 0, gitSyncEnabled: false, nextRefillAt: '',
    billingPeriodEndAt: '', createdAt: '', membershipRole: '', planType: 'monthly',
    ...overrides,
  };
}

describe('explainEffectiveStatus — final status agrees with getEffectiveStatus', () => {
  const scenarios: { name: string; ws: Partial<WorkspaceCredit>; grace: number; refill: number }[] = [
    { name: 'normal', ws: { subscriptionStatus: 'active', tier: 'PRO' }, grace: 30, refill: 7 },
    { name: 'about-to-refill', ws: { subscriptionStatus: 'active', tier: 'PRO', nextRefillAt: isoDaysAhead(3) }, grace: 30, refill: 7 },
    { name: 'past_due', ws: { subscriptionStatus: 'past_due', tier: 'EXPIRED', subscriptionStatusChangedAt: isoDaysAgo(2) }, grace: 30, refill: 7 },
    { name: 'expired (tier)', ws: { subscriptionStatus: 'incomplete', tier: 'EXPIRED', subscriptionStatusChangedAt: isoDaysAgo(5) }, grace: 30, refill: 7 },
    { name: 'fully-expired (tier+grace)', ws: { subscriptionStatus: 'incomplete', tier: 'EXPIRED', subscriptionStatusChangedAt: isoDaysAgo(40) }, grace: 30, refill: 7 },
    { name: 'expired-canceled', ws: { subscriptionStatus: 'canceled', tier: 'EXPIRED', subscriptionStatusChangedAt: isoDaysAgo(5) }, grace: 30, refill: 7 },
    { name: 'fully-expired (canceled+grace)', ws: { subscriptionStatus: 'canceled', tier: 'EXPIRED', subscriptionStatusChangedAt: isoDaysAgo(40) }, grace: 30, refill: 7 },
    // Same scenarios under non-default thresholds:
    { name: 'about-to-refill at refill=14', ws: { subscriptionStatus: 'active', tier: 'PRO', nextRefillAt: isoDaysAhead(10) }, grace: 30, refill: 14 },
    { name: 'fully-expired at grace=7', ws: { subscriptionStatus: 'canceled', tier: 'EXPIRED', subscriptionStatusChangedAt: isoDaysAgo(8) }, grace: 7, refill: 7 },
    { name: 'expired-canceled at grace=90', ws: { subscriptionStatus: 'canceled', tier: 'EXPIRED', subscriptionStatusChangedAt: isoDaysAgo(60) }, grace: 90, refill: 7 },
  ];

  it.each(scenarios)('$name: explanation.status equals getEffectiveStatus result', ({ ws, grace, refill }) => {
    const workspace = makeWs(ws);
    const c = cfg(grace, refill);
    const expl = explainEffectiveStatus(workspace, c, NOW);
    const direct = getEffectiveStatus(workspace, c, NOW);
    expect(expl.status.kind).toBe(direct.kind);
    expect(expl.status.label).toBe(direct.label);
  });

  it.each(scenarios)('$name: exactly one rule has matched=true', ({ ws, grace, refill }) => {
    const expl = explainEffectiveStatus(makeWs(ws), cfg(grace, refill), NOW);
    const matched = expl.steps.filter(s => s.matched);
    expect(matched.length).toBe(1);
  });

  it.each(scenarios)('$name: every skipped step has a non-empty reason', ({ ws, grace, refill }) => {
    const expl = explainEffectiveStatus(makeWs(ws), cfg(grace, refill), NOW);
    for (const step of expl.steps) {
      if (!step.matched) expect(step.skippedReason && step.skippedReason.length > 0).toBe(true);
    }
  });
});

describe('explainEffectiveStatus — inputs snapshot', () => {
  it('captures active grace and refill thresholds verbatim', () => {
    const expl = explainEffectiveStatus(makeWs({}), cfg(45, 21), NOW);
    expect(expl.inputs.expiryGracePeriodDays).toBe(45);
    expect(expl.inputs.refillWarningThresholdDays).toBe(21);
  });

  it('reports daysSinceChange computed from changedAt', () => {
    const expl = explainEffectiveStatus(
      makeWs({ subscriptionStatusChangedAt: isoDaysAgo(12) }),
      cfg(30, 7), NOW,
    );
    expect(expl.inputs.daysSinceChange).toBe(12);
  });

  it('reports refillIsoUsed === nextRefillAt when present', () => {
    const next = isoDaysAhead(5);
    const expl = explainEffectiveStatus(
      makeWs({ nextRefillAt: next, billingPeriodEndAt: isoDaysAhead(20) }),
      cfg(30, 7), NOW,
    );
    expect(expl.inputs.refillIsoUsed).toBe(next);
  });

  it('falls back refillIsoUsed to billingPeriodEndAt when nextRefillAt missing', () => {
    const billing = isoDaysAhead(15);
    const expl = explainEffectiveStatus(
      makeWs({ billingPeriodEndAt: billing }),
      cfg(30, 7), NOW,
    );
    expect(expl.inputs.refillIsoUsed).toBe(billing);
  });

  it('lowercases subscription_status and uppercases tier', () => {
    const expl = explainEffectiveStatus(
      makeWs({ subscriptionStatus: 'PAST_DUE', tier: 'expired' }),
      cfg(30, 7), NOW,
    );
    expect(expl.inputs.subscriptionStatus).toBe('past_due');
    expect(expl.inputs.tier).toBe('EXPIRED');
  });
});
