/**
 * MacroLoop Controller — CSV Export for Workspace Credits (v2.223.0)
 *
 * Builds and downloads CSV files of workspace credit data with options for
 * all workspaces or only those with available credits.
 *
 * Column set (49 fields):
 *   • Identity / membership   (5)
 *   • Plan + subscription     (4)
 *   • Daily credit columns    (4)
 *   • Rollover columns        (3)
 *   • Billing columns         (3)
 *   • Granted + topup         (4)
 *   • Totals + available      (5)
 *   • Workspace meta          (4)
 *   • Period dates            (5)
 *   • Owner / flags           (3)
 *   • Lifecycle (computed)    (7) ← added v2.223.0 (status kind/label, change date,
 *                                    days since change, days to refill, active grace
 *                                    + refill-warning thresholds)
 *   • Computed ratios         (2) ← added v2.223.0 (Available % of Total, Daily % Used)
 *   • Export snapshot meta    (1) ← added v2.223.0 (Malaysia-timezone snapshot)
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { loopCreditState } from './shared-state';
import type { WorkspaceCredit } from './types';
import { log } from './logging';
import { getEffectiveStatus, daysBetween, daysUntil } from './workspace-status';
import { getWorkspaceLifecycleConfig, type WorkspaceLifecycleConfig } from './workspace-lifecycle-config';

// ── CSV Helpers ──

function csvVal(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Round to 1 decimal; returns '' for non-finite. */
function pct(num: number, denom: number): string {
  if (!Number.isFinite(num) || !Number.isFinite(denom) || denom <= 0) return '';
  return (Math.round((num / denom) * 1000) / 10).toFixed(1);
}

/** Malaysia-timezone (UTC+8) ISO-like timestamp: 2026-04-22T19:40:43+08:00. */
function nowMalaysiaIso(): string {
  const now = new Date();
  // UTC+8 offset in ms
  const local = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = local.getUTCFullYear();
  const MM = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const HH = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  const ss = String(local.getUTCSeconds()).padStart(2, '0');
  return yyyy + '-' + MM + '-' + dd + 'T' + HH + ':' + mm + ':' + ss + '+08:00';
}

// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- declarative column assembly with per-cell fallback ternaries; splitting hides the column ↔ header alignment that this file is built around
function buildCsvRow(
  ws: WorkspaceCredit,
  cfg: WorkspaceLifecycleConfig,
  exportedAt: string,
): (string | number)[] {
  const r: Record<string, string | number> = ws.raw || {};
  const m: Record<string, string> = (r.membership || {}) as Record<string, string>;
  const status = getEffectiveStatus(ws, cfg);
  const daysSinceChange = ws.subscriptionStatusChangedAt ? daysBetween(ws.subscriptionStatusChangedAt) : '';
  const refillIso = ws.nextRefillAt || ws.billingPeriodEndAt || '';
  const dToRefill = refillIso ? daysUntil(refillIso) : -1;
  return [
    csvVal(ws.fullName),
    csvVal(ws.name),
    csvVal(ws.id),
    csvVal(m.email || ''),
    csvVal(ws.membershipRole || m.role || ws.role || ''),
    csvVal(r.plan || ws.plan || ''),
    csvVal(ws.planType || r.plan_type || ''),
    csvVal(ws.subscriptionStatus || r.subscription_status || ''),
    csvVal(r.subscription_currency || ''),
    csvVal(r.payment_provider || ''),
    ws.dailyFree,
    ws.dailyLimit,
    ws.dailyUsed,
    r.daily_credits_used_in_billing_period != null ? r.daily_credits_used_in_billing_period : '',
    ws.rollover,
    ws.rolloverLimit,
    ws.rolloverUsed,
    ws.billingAvailable,
    ws.limit,
    ws.used,
    ws.freeGranted,
    ws.freeRemaining,
    ws.topupLimit,
    r.topup_credits_used != null ? r.topup_credits_used : '',
    ws.totalCredits,
    ws.totalCreditsUsed != null ? ws.totalCreditsUsed : (r.total_credits_used != null ? r.total_credits_used : ''),
    r.total_credits_used_in_billing_period != null ? r.total_credits_used_in_billing_period : '',
    ws.available,
    r.backend_total_used_in_billing_period != null ? r.backend_total_used_in_billing_period : '',
    // Workspace meta
    ws.numProjects != null ? ws.numProjects : (r.num_projects != null ? r.num_projects : ''),
    ws.gitSyncEnabled ? 'true' : 'false',
    r.referral_count != null ? r.referral_count : '',
    r.followers_count != null ? r.followers_count : '',
    // Period dates
    csvVal(r.billing_period_start_date || ''),
    csvVal(ws.billingPeriodEndAt || r.billing_period_end_date || ''),
    csvVal(ws.nextRefillAt || r.next_monthly_credit_grant_date || ''),
    csvVal(ws.createdAt || r.created_at || ''),
    csvVal(r.updated_at || ''),
    // Owner + flags
    csvVal(r.owner_id || ''),
    r.mcp_enabled != null ? r.mcp_enabled : '',
    // Lifecycle (computed) — v2.223.0
    csvVal(status.kind),
    csvVal(status.label),
    csvVal(ws.subscriptionStatusChangedAt || ''),
    daysSinceChange,
    dToRefill >= 0 ? dToRefill : '',
    cfg.expiryGracePeriodDays,
    cfg.refillWarningThresholdDays,
    // Computed ratios — v2.223.0
    pct(ws.available || 0, ws.totalCredits || 0),
    pct(ws.dailyUsed || 0, ws.dailyLimit || 0),
    // Export snapshot meta — v2.223.0
    csvVal(exportedAt),
  ];
}

const CSV_HEADER = [
  'Workspace Name', 'Workspace Short Name', 'Workspace ID', 'Email', 'Role',
  'Plan', 'Plan Type', 'Subscription Status', 'Subscription Currency', 'Payment Provider',
  'Daily Free', 'Daily Limit', 'Daily Used', 'Daily Used In Billing',
  'Rollover', 'Rollover Limit', 'Rollover Used',
  'Billing Available', 'Billing Limit', 'Billing Used',
  'Granted', 'Granted Remaining', 'Topup Limit', 'Topup Used',
  'Total Credits', 'Total Credits Used', 'Total Used In Billing', 'Available Credits',
  'Backend Used In Billing',
  'Num Projects', 'Git Sync Enabled', 'Referral Count', 'Followers Count',
  'Billing Period Start', 'Billing Period End', 'Next Credit Grant Date',
  'Created At', 'Updated At',
  'Owner ID', 'MCP Enabled',
  // Lifecycle (computed)
  'Status Kind', 'Status Label', 'Subscription Status Changed At',
  'Days Since Status Change', 'Days To Refill',
  'Active Grace Period (days)', 'Active Refill Warning (days)',
  // Computed ratios
  'Available % of Total', 'Daily % Used',
  // Export snapshot meta
  'Exported At (Asia/Kuala_Lumpur)',
].join(',');

function downloadCsvBlob(csvText: string, filename: string): void {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Exports ──

export function exportWorkspacesAsCsv(): void {
  const workspaces = loopCreditState.perWorkspace;
  if (!workspaces || workspaces.length === 0) {
    log('CSV Export: No workspace data — fetch credits first (💳)', 'warn');
    return;
  }

  const sorted = workspaces.slice().sort(function(a: WorkspaceCredit, b: WorkspaceCredit) {
    return (a.fullName || '').toLowerCase().localeCompare((b.fullName || '').toLowerCase());
  });

  const cfg = getWorkspaceLifecycleConfig();
  const exportedAt = nowMalaysiaIso();
  const lines = [CSV_HEADER];

  for (const ws of sorted) {
    lines.push(buildCsvRow(ws, cfg, exportedAt).join(','));
  }

  downloadCsvBlob(lines.join('\n'), 'workspaces-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv');
  log('CSV Export: Downloaded ' + sorted.length + ' workspaces (sorted A→Z, ' + (CSV_HEADER.split(',').length) + ' columns)', 'success');
}

export function exportAvailableWorkspacesAsCsv(): void {
  const workspaces = loopCreditState.perWorkspace;
  if (!workspaces || workspaces.length === 0) {
    log('CSV Export (available): No workspace data — fetch credits first (💳)', 'warn');
    return;
  }

  const filtered = workspaces.filter(function(ws: WorkspaceCredit) {
    return (ws.available || 0) > 0;
  });

  if (filtered.length === 0) {
    log('CSV Export (available): No workspaces with available credits > 0', 'warn');
    return;
  }

  const sorted = filtered.slice().sort(function(a: WorkspaceCredit, b: WorkspaceCredit) {
    return (a.fullName || '').toLowerCase().localeCompare((b.fullName || '').toLowerCase());
  });

  const cfg = getWorkspaceLifecycleConfig();
  const exportedAt = nowMalaysiaIso();
  const lines = [CSV_HEADER];

  for (const ws of sorted) {
    lines.push(buildCsvRow(ws, cfg, exportedAt).join(','));
  }

  downloadCsvBlob(lines.join('\n'), 'workspaces-available-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv');
  log('CSV Export (available): Downloaded ' + sorted.length + '/' + workspaces.length + ' workspaces with credits > 0', 'success');
}
