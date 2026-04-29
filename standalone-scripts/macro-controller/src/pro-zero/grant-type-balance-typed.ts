/**
 * GrantTypeBalance — entry in CreditBalanceResponse.grant_type_balances.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §6.4
 */

import type { CreditGrantType } from './credit-grant-type';

export interface GrantTypeBalanceTyped {
    grant_type: CreditGrantType;
    granted: number;
    remaining: number;
}
