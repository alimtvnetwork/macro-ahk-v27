/**
 * CreditBalanceFetchStatus — discriminator for CreditBalanceFetchResult.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §4.3
 */

export enum CreditBalanceFetchStatus {
    SUCCESS = 'SUCCESS',
    HTTP_ERROR = 'HTTP_ERROR',
    NETWORK_ERROR = 'NETWORK_ERROR',
    PARSE_ERROR = 'PARSE_ERROR',
}
