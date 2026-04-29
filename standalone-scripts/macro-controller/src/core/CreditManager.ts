/**
 * CreditManager — Wraps credit-fetch.ts + credit-api.ts into a class (V2 Phase 02, Step 3)
 *
 * Implements CreditManagerInterface from MacroController.
 * Delegates to existing functions — no logic duplication.
 *
 * See: spec/04-macro-controller/ts-migration-v2/02-class-architecture.md
 */

import type { CreditManagerInterface } from './MacroController';
import type { LoopCreditState, CreditBalanceResponse } from '../types';
import { calcTotalCredits, calcAvailableCredits, calcFreeCreditAvailable } from '../credit-api';
import { loopCreditState } from '../shared-state';
import { fetchCreditBalance } from '../credit-balance';

import { fetchLoopCredits, fetchLoopCreditsAsync, parseLoopApiResponse, syncCreditStateFromApi } from '../credit-fetch';

export class CreditManager implements CreditManagerInterface {

  /** Callback-style credit fetch (with optional retry) */
  fetch(isRetry?: boolean): void {
    fetchLoopCredits(isRetry);
  }

  /** Promise-returning credit fetch */
  fetchAsync(isRetry?: boolean): Promise<void> {
    return fetchLoopCreditsAsync(isRetry);
  }

  /** Fetch credit balance for a specific workspace */
  fetchBalance(workspaceId?: string): Promise<CreditBalanceResponse | null> {
    return fetchCreditBalance(workspaceId);
  }

  /** Return the full credit state object */
  getState(): LoopCreditState {
    return loopCreditState;
  }

  /** Parse raw API response into loopCreditState */
  parse(data: Record<string, unknown>): boolean {
    return parseLoopApiResponse(data);
  }

  /** Sync loop state (hasFreeCredit, isIdle) from current workspace credit data */
  sync(): void {
    syncCreditStateFromApi();
  }

  /** Calculate total credits from component limits */
  calcTotal(granted: number, dailyLimit: number, billingLimit: number, topupLimit: number, rolloverLimit: number): number {
    return calcTotalCredits(granted, dailyLimit, billingLimit, topupLimit, rolloverLimit);
  }

  /** Calculate available credits */
  calcAvailable(totalCredits: number, rolloverUsed: number, dailyUsed: number, billingUsed: number, freeUsed: number): number {
    return calcAvailableCredits(totalCredits, rolloverUsed, dailyUsed, billingUsed, freeUsed);
  }

  /** Calculate free credit remaining */
  calcFree(dailyLimit: number, dailyUsed: number): number {
    return calcFreeCreditAvailable(dailyLimit, dailyUsed);
  }
}
