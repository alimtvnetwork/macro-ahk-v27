/**
 * MacroCreditSource — origin of the resolved MacroCreditSummary.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §4.5
 */

export enum MacroCreditSource {
    WORKSPACE_INFO = 'WORKSPACE_INFO',
    CREDIT_BALANCE = 'CREDIT_BALANCE',
}
