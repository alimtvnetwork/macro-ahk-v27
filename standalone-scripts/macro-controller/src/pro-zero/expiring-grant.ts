/**
 * ExpiringGrant — entry in CreditBalanceResponse.expiring_grants.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §6.3
 */

import type { CreditGrantType } from './credit-grant-type';

export interface ExpiringGrant {
    grant_type: CreditGrantType;
    credits: number;
    expires_at: string;
}
