/**
 * LoopEngine — Wraps loop-engine.ts into a class (V2 Phase 02, Step 5)
 *
 * Implements LoopEngineInterface from MacroController.
 * Delegates to existing loop-engine.ts functions — no logic duplication.
 *
 * See: spec/04-macro-controller/ts-migration-v2/02-class-architecture.md
 */

import type { LoopEngineInterface } from './MacroController';
import { setLoopInterval } from '../ui/ui-updaters';
import { state } from '../shared-state';
import { LoopDirection } from '../types';

import {
  dispatchDelegateSignal, performDirectMove, runCheck, startLoop, stopLoop,
  runCycle as loopRunCycle, delegateComplete as loopDelegateComplete,
} from '../loop-engine';

export class LoopEngine implements LoopEngineInterface {

  /** Start the automation loop in a direction (up/down) */
  start(direction?: string): void {
    startLoop(direction || 'down');
  }

  /** Stop the automation loop */
  stop(): void {
    stopLoop();
  }

  /** Run a manual check (workspace + credit detection) */
  check(): Promise<void> | undefined {
    return runCheck();
  }

  /** Set the loop interval in milliseconds */
  setInterval(ms: number): boolean {
    return setLoopInterval(ms);
  }

  /** Whether the loop is currently running */
  isRunning(): boolean {
    return state.running;
  }

  /** Run a single cycle manually */
  runCycle(): void {
    loopRunCycle();
  }

  /** Perform a direct API move in a direction */
  directMove(direction: LoopDirection | string): void {
    performDirectMove(direction as LoopDirection);
  }

  /** Signal that a delegated move completed */
  delegateComplete(): void {
    loopDelegateComplete();
  }

  /** Dispatch delegate signal via title/clipboard (deprecated AHK) */
  dispatchSignal(direction: string): void {
    dispatchDelegateSignal(direction);
  }
}
