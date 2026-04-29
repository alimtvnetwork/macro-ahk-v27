/**
 * pro-zero-credit-balance-client — typed GET /workspaces/{WorkspaceId}/credit-balance.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §5.2, §6.7
 *
 * Returns a discriminated `CreditBalanceFetchResult`. Never throws. Every
 * failure path is logged via `pro-zero-logger.logFailed()` and the
 * Authorization header is never reachable from logs.
 */

import { CreditBalanceFetchStatus } from './credit-balance-fetch-status';
import type { CreditBalanceFetchResult } from './credit-balance-fetch-result';
import { parseCreditBalanceResponse } from './credit-balance-response-parser';
import { callFetchBalance, type SdkBalanceResponse } from './pro-zero-sdk-adapter';
import { logRequested, logReceived, logFailed } from './pro-zero-logger';
import { toErrorMessage } from '../error-utils';

function buildHttpError(status: number): CreditBalanceFetchResult {
    logFailed(CreditBalanceFetchStatus.HTTP_ERROR, 'httpStatus=' + status);

    return { status: CreditBalanceFetchStatus.HTTP_ERROR, httpStatus: status };
}

function buildParseError(reason: string): CreditBalanceFetchResult {
    logFailed(CreditBalanceFetchStatus.PARSE_ERROR, 'reason=' + reason);

    return { status: CreditBalanceFetchStatus.PARSE_ERROR, reason };
}

function buildNetworkError(reason: string): CreditBalanceFetchResult {
    logFailed(CreditBalanceFetchStatus.NETWORK_ERROR, 'reason=' + reason);

    return { status: CreditBalanceFetchStatus.NETWORK_ERROR, reason };
}

function handleResponse(resp: SdkBalanceResponse): CreditBalanceFetchResult {
    if (!resp.ok) return buildHttpError(resp.status);
    const parsed = parseCreditBalanceResponse(resp.data);
    if (!parsed.isOk) return buildParseError(parsed.reason);
    logReceived(parsed.data.total_granted, parsed.data.total_remaining, parsed.data.total_billing_period_used);

    return { status: CreditBalanceFetchStatus.SUCCESS, data: parsed.data };
}

export async function fetchProZeroCreditBalance(workspaceId: string): Promise<CreditBalanceFetchResult> {
    logRequested(workspaceId);
    try {
        const resp = await callFetchBalance(workspaceId);

        return handleResponse(resp);
    } catch (caught: unknown) {
        return buildNetworkError(toErrorMessage(caught));
    }
}
