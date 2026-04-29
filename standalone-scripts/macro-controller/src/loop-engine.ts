/**
 * MacroLoop Controller — Loop Engine (barrel re-export)
 *
 * Phase 5C: Split into loop-controls.ts, loop-cycle.ts, loop-dom-fallback.ts.
 * This barrel preserves backward-compatible imports.
 * See: spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

export { runCheck, startLoop, stopLoop, refreshStatus, startStatusRefresh, stopStatusRefresh } from './loop-controls';
export { runCycle } from './loop-cycle';
export { runCycleDomFallback, performDirectMove, forceSwitch, delegateComplete, dispatchDelegateSignal } from './loop-dom-fallback';
