/**
 * credit-balance-response-parser — validates SDK response data into CreditBalanceResponseTyped.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §6.5
 *
 * Returns a discriminated union — never throws. Caller maps to CreditBalanceFetchResult.
 */

import type { CreditBalanceResponseTyped } from './credit-balance-response-typed';

export type ParseOutcome =
    | { isOk: true; data: CreditBalanceResponseTyped }
    | { isOk: false; reason: string };

function isNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function hasRequiredNumbers(d: { [k: string]: unknown }): boolean {
    return isNumber(d.total_granted) && isNumber(d.total_remaining) && isNumber(d.total_billing_period_used);
}

function asArray(v: unknown): unknown[] {
    return Array.isArray(v) ? v : [];
}

export function parseCreditBalanceResponse(raw: unknown): ParseOutcome {
    if (!raw || typeof raw !== 'object') return { isOk: false, reason: 'response is not an object' };
    const d = raw as { [k: string]: unknown };
    if (!hasRequiredNumbers(d)) return { isOk: false, reason: 'missing total_granted/total_remaining/total_billing_period_used' };

    return {
        isOk: true,
        data: {
            ledger_enabled: d.ledger_enabled === true,
            total_remaining: d.total_remaining as number,
            total_granted: d.total_granted as number,
            daily_remaining: isNumber(d.daily_remaining) ? d.daily_remaining : 0,
            daily_limit: isNumber(d.daily_limit) ? d.daily_limit : 0,
            total_billing_period_used: d.total_billing_period_used as number,
            expiring_grants: asArray(d.expiring_grants) as CreditBalanceResponseTyped['expiring_grants'],
            grant_type_balances: asArray(d.grant_type_balances) as CreditBalanceResponseTyped['grant_type_balances'],
        },
    };
}
