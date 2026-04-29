/**
 * MacroCreditSummary — controller output of the credit-resolution flow.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §6.6
 */

import type { MacroCreditSource } from './macro-credit-source';

export interface MacroCreditSummary {
    Total: number;
    AvailableCredits: number;
    TotalUsed: number;
    Source: MacroCreditSource;
}
