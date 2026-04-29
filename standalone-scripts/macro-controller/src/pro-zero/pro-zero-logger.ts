/**
 * pro-zero-logger — typed wrappers around RiseupAsiaMacroExt.Logger for the pro_0 flow.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §10
 *
 * Every log line goes through the existing logger (`mem://standards/error-logging-via-namespace-logger`).
 * Authorization values are NEVER passed to these helpers — the caller is
 * responsible for redacting first via `redactBearer()` (sibling helper).
 */

import { CreditBalanceLogEvent } from './credit-balance-log-event';
import { CreditBalanceFetchStatus } from './credit-balance-fetch-status';
import { WorkspacePlan } from './workspace-plan';
import { logError, logConsole } from '../error-utils';

const FN = 'ProZeroCreditBalance';

export function logRequested(workspaceId: string): void {
    logConsole(FN, CreditBalanceLogEvent.CREDIT_BALANCE_REQUESTED + ' WorkspaceId=' + workspaceId);
}

export function logReceived(totalGranted: number, totalRemaining: number, billingUsed: number): void {
    logConsole(FN, CreditBalanceLogEvent.CREDIT_BALANCE_RECEIVED
        + ' total_granted=' + totalGranted
        + ' total_remaining=' + totalRemaining
        + ' total_billing_period_used=' + billingUsed);
}

export function logFailed(status: CreditBalanceFetchStatus, detail: string): void {
    logError(FN, CreditBalanceLogEvent.CREDIT_BALANCE_FAILED + ' status=' + status + ' detail=' + detail);
}

export function logSkippedNonProZero(plan: WorkspacePlan): void {
    logConsole(FN, CreditBalanceLogEvent.CREDIT_BALANCE_SKIPPED_NON_PRO_ZERO + ' plan=' + plan);
}
