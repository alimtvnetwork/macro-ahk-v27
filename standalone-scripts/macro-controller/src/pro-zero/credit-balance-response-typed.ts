/**
 * CreditBalanceResponseTyped — strict typed view of /credit-balance JSON.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §6.5
 */

import type { ExpiringGrant } from './expiring-grant';
import type { GrantTypeBalanceTyped } from './grant-type-balance-typed';

export interface CreditBalanceResponseTyped {
    ledger_enabled: boolean;
    total_remaining: number;
    total_granted: number;
    daily_remaining: number;
    daily_limit: number;
    total_billing_period_used: number;
    expiring_grants: ExpiringGrant[];
    grant_type_balances: GrantTypeBalanceTyped[];
}
