/**
 * CreditBalanceLogEvent — log labels for the pro_0 credit-balance flow.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §10
 */

export enum CreditBalanceLogEvent {
    CREDIT_BALANCE_REQUESTED = 'CREDIT_BALANCE_REQUESTED',
    CREDIT_BALANCE_RECEIVED = 'CREDIT_BALANCE_RECEIVED',
    CREDIT_BALANCE_FAILED = 'CREDIT_BALANCE_FAILED',
    CREDIT_BALANCE_SKIPPED_NON_PRO_ZERO = 'CREDIT_BALANCE_SKIPPED_NON_PRO_ZERO',
}
