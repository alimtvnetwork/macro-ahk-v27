/**
 * Status Explainer — Debug trace for `getEffectiveStatus`
 *
 * Pure function that re-runs the same priority ladder used by
 * `getEffectiveStatus` (workspace-status.ts) and records every check it
 * performed, the inputs it consulted, and which rule fired (or why each rule
 * was skipped). Intended for the workspace hover-card debug section so users
 * can see exactly how the active grace period and refill-warning thresholds
 * combined with the workspace's subscription_status, tier, and dates to
 * produce the displayed pill.
 *
 * No DOM access. No side effects. Stays in lockstep with `getEffectiveStatus`.
 */
import type { WorkspaceCredit } from './types';
import type { WorkspaceLifecycleConfig } from './workspace-lifecycle-config';
import type { WorkspaceStatus, WorkspaceStatusKind } from './workspace-status';
import { daysBetween, daysUntil, getEffectiveStatus } from './workspace-status';

export interface StatusTraceStep {
  /** Short identifier of the rule (e.g. 'canceled', 'past_due'). */
  rule: string;
  /** Human-readable description of what the rule looks for. */
  description: string;
  /** True when this rule was the one that fired. */
  matched: boolean;
  /** Reason this rule was skipped (only set when matched === false). */
  skippedReason?: string;
}

export interface StatusExplanation {
  /** Final status produced by getEffectiveStatus. */
  status: WorkspaceStatus;
  /** Inputs consulted (snapshot of the relevant workspace + config fields). */
  inputs: {
    subscriptionStatus: string;
    tier: string;
    subscriptionStatusChangedAt: string;
    daysSinceChange: number;
    nextRefillAt: string;
    billingPeriodEndAt: string;
    refillIsoUsed: string;
    daysToRefill: number;
    expiryGracePeriodDays: number;
    refillWarningThresholdDays: number;
  };
  /** Ordered checks the resolver performed. Exactly one has matched=true. */
  steps: StatusTraceStep[];
}

function pickRefillIso(ws: WorkspaceCredit): string {
  if (ws.nextRefillAt) return ws.nextRefillAt;
  if (ws.billingPeriodEndAt) return ws.billingPeriodEndAt;
  return '';
}

/**
 * Re-runs the resolver logic and reports each check in order.
 *
 * MUST stay in sync with `getEffectiveStatus()` — any rule reorder there must
 * be mirrored here. Both functions read the same workspace + config inputs.
 */
// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- linear trace mirroring the 6-rule ladder; splitting hides the priority order and the per-rule skip-reason ternaries are intentionally local for readability
export function explainEffectiveStatus(
  ws: WorkspaceCredit,
  cfg: WorkspaceLifecycleConfig,
  nowMs?: number,
): StatusExplanation {
  const subStatus = (ws.subscriptionStatus || '').toLowerCase().trim();
  const tier = (ws.tier || '').toUpperCase();
  const changedIso = ws.subscriptionStatusChangedAt || '';
  const daysSinceChange = changedIso ? daysBetween(changedIso, nowMs) : 0;
  const grace = cfg.expiryGracePeriodDays;
  const refillIso = pickRefillIso(ws);
  const refillWindow = cfg.refillWarningThresholdDays;
  const dToRefill = refillIso ? daysUntil(refillIso, nowMs) : -1;

  const isCanceled = subStatus === 'canceled' || subStatus === 'cancelled';
  const isPastDue = subStatus === 'past_due' || subStatus === 'unpaid';

  const steps: StatusTraceStep[] = [];
  const finalStatus = getEffectiveStatus(ws, cfg, nowMs);
  let claimed = false;

  function add(rule: string, desc: string, didMatch: boolean, reason?: string): void {
    if (didMatch && !claimed) {
      claimed = true;
      steps.push({ rule, description: desc, matched: true });
    } else {
      steps.push({ rule, description: desc, matched: false, skippedReason: reason || 'condition not met' });
    }
  }

  // 1. canceled + grace exceeded → fully-expired
  add(
    'canceled + grace exceeded',
    'subscription_status is canceled AND days since change ≥ grace (' + grace + 'd) → fully-expired',
    isCanceled && !!changedIso && daysSinceChange >= grace,
    !isCanceled
      ? 'subscription_status is "' + (subStatus || 'empty') + '" (not canceled)'
      : !changedIso
        ? 'no subscription_status_changed_at on the workspace'
        : 'only ' + daysSinceChange + 'd since change (need ≥ ' + grace + 'd)',
  );

  // 2. canceled (within grace)
  add(
    'canceled (within grace)',
    'subscription_status is canceled → expired-canceled',
    isCanceled && !(changedIso && daysSinceChange >= grace),
    !isCanceled ? 'subscription_status is "' + (subStatus || 'empty') + '" (not canceled)' : 'rule 1 already fired',
  );

  // 3 & 4. tier === EXPIRED (non-past_due)
  const tierExpired = tier === 'EXPIRED' && !isPastDue;
  add(
    'tier=EXPIRED + grace exceeded',
    'tier is EXPIRED (non past_due) AND days since change ≥ grace (' + grace + 'd) → fully-expired',
    tierExpired && !!changedIso && daysSinceChange >= grace,
    tier !== 'EXPIRED'
      ? 'tier is "' + (tier || 'empty') + '" (not EXPIRED)'
      : isPastDue
        ? 'subscription_status is past_due — handled by rule 5 instead'
        : !changedIso
          ? 'no subscription_status_changed_at'
          : 'only ' + daysSinceChange + 'd since change (need ≥ ' + grace + 'd)',
  );
  add(
    'tier=EXPIRED (within grace)',
    'tier is EXPIRED (non past_due) → expired',
    tierExpired && !(changedIso && daysSinceChange >= grace),
    tier !== 'EXPIRED'
      ? 'tier is "' + (tier || 'empty') + '" (not EXPIRED)'
      : isPastDue
        ? 'subscription_status is past_due — handled by rule 5 instead'
        : 'rule 3 already fired',
  );

  // 5. past_due
  add(
    'past_due',
    'subscription_status is past_due / unpaid → about-to-expire',
    isPastDue,
    'subscription_status is "' + (subStatus || 'empty') + '" (not past_due / unpaid)',
  );

  // 6. about-to-refill
  const inRefillWindow = !!refillIso && dToRefill >= 0 && dToRefill <= refillWindow;
  add(
    'about-to-refill',
    'next refill within refill-warning window (' + refillWindow + 'd) → about-to-refill',
    inRefillWindow,
    !refillIso
      ? 'no nextRefillAt or billingPeriodEndAt on workspace'
      : dToRefill < 0
        ? 'refill date is in the past or unparseable'
        : dToRefill + 'd to refill is outside the ' + refillWindow + 'd warning window',
  );

  // 7. normal (always last)
  add(
    'normal',
    'no other rule matched → normal (no pill)',
    finalStatus.kind === ('normal' as WorkspaceStatusKind),
    'a higher-priority rule fired',
  );

  return {
    status: finalStatus,
    inputs: {
      subscriptionStatus: subStatus,
      tier,
      subscriptionStatusChangedAt: changedIso,
      daysSinceChange,
      nextRefillAt: ws.nextRefillAt || '',
      billingPeriodEndAt: ws.billingPeriodEndAt || '',
      refillIsoUsed: refillIso,
      daysToRefill: dToRefill,
      expiryGracePeriodDays: grace,
      refillWarningThresholdDays: refillWindow,
    },
    steps,
  };
}
