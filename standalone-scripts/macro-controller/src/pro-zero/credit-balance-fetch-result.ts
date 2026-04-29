/**
 * CreditBalanceFetchResult — discriminated union returned by the fetch client.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §6.7
 */

import { CreditBalanceFetchStatus } from './credit-balance-fetch-status';
import type { CreditBalanceResponseTyped } from './credit-balance-response-typed';

export type CreditBalanceFetchResult =
    | { status: CreditBalanceFetchStatus.SUCCESS; data: CreditBalanceResponseTyped }
    | { status: CreditBalanceFetchStatus.HTTP_ERROR; httpStatus: number }
    | { status: CreditBalanceFetchStatus.NETWORK_ERROR; reason: string }
    | { status: CreditBalanceFetchStatus.PARSE_ERROR; reason: string };
