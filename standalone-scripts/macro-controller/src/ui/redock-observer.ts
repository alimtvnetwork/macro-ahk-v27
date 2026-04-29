/**
 * Re-Dock Observer — monitors for the XPath target container and
 * relocates the panel from document.body into it when it appears.
 *
 * Strategy: Panel mounts instantly on body (floating), then this
 * observer polls for the XPath target. Once found, the panel is
 * moved into it and floating mode is disabled for an inline layout.
 *
 * @see .lovable/memory/architecture/macro-controller/bootstrap-strategy.md
 * @see .lovable/memory/features/macro-controller/ui-recovery-logic.md
 */

import { log } from '../logging';
import { logError } from '../error-utils';
import { getByXPath } from '../xpath-utils';
import { CONFIG, IDS, TIMING } from '../shared-state';
import { pollUntil } from '../async-utils';
import { showToast } from '../toast';
import type { PanelLayoutCtx } from './panel-layout';
import { disableFloating } from './panel-layout';

// CQ11: Singleton for redock observer state.
// PERF-4 (2026-04-25): the legacy `pollTimer` setter was dead — actual
// polling lives inside pollUntil() (no cancel handle). We now drive
// cancellation through a generation token: each startRedockObserver()
// bumps `generation`, and the polling condition short-circuits when its
// captured token no longer matches the current one. resetRedockState()
// bumps the generation, which causes any in-flight poll to resolve null
// on its next tick.
class RedockState {
  private _docked = false;
  private _generation = 0;

  get docked(): boolean {
    return this._docked;
  }

  set docked(v: boolean) {
    this._docked = v;
  }

  get generation(): number {
    return this._generation;
  }

  /** Invalidate any in-flight redock poll. Returns the new generation token. */
  invalidate(): number {
    this._generation += 1;
    return this._generation;
  }
}

const redockState = new RedockState();

/**
 * Start observing for the XPath target container.
 * If already docked or target already present, re-docks immediately.
 * Polls periodically until found or max attempts exceeded.
 */
export function startRedockObserver(ctx: PanelLayoutCtx): void {
  // Already docked into XPath target — nothing to do
  if (redockState.docked) return;

  // Try immediate dock
  if (tryRedock(ctx)) return;

  // PERF-4: invalidate any in-flight poll, then capture the new generation
  // so this observer's condition can short-circuit if reset/restarted.
  const myGeneration = redockState.invalidate();

  const pollMs = TIMING.REDOCK_POLL_INTERVAL;
  const maxAttempts = TIMING.REDOCK_MAX_ATTEMPTS;

  log('[redock] Observing for XPath target (polling every ' + pollMs + 'ms, max ' + maxAttempts + ' attempts)', 'info');

  pollUntil(
    function () {
      // Cancel: a newer generation has started, or state was reset.
      if (redockState.generation !== myGeneration) return true as unknown as null;
      return tryRedock(ctx) || null;
    },
    {
      intervalMs: pollMs,
      timeoutMs: pollMs * maxAttempts,
      onTimeout: function () {
        if (redockState.generation !== myGeneration) return;
        log('[redock] XPath target not found after ' + maxAttempts + ' attempts — staying in floating mode', 'warn');
      },
    },
  );
}

/**
 * Attempt to relocate the panel from body into the XPath target.
 * Returns true if successfully docked.
 */
function tryRedock(ctx: PanelLayoutCtx): boolean {
  const target = getByXPath(CONFIG.CONTROLS_XPATH);
  if (!target) return false;

  const ui = document.getElementById(IDS.CONTAINER);
  if (!ui) return false;

  // Already inside the target — just mark as docked
  if (target.contains(ui)) {
    redockState.docked = true;
    return true;
  }

  // Relocate: remove from current parent (body) and append to XPath target
  const startTime = performance.now();
  try {
    target.appendChild(ui);
    disableFloating(ctx);
    redockState.docked = true;

    // Visual glow feedback
    ui.style.transition = 'box-shadow 0.4s ease-out';
    ui.style.boxShadow = '0 0 12px 4px rgba(74,222,128,0.5)';
    setTimeout(function () {
      ui.style.boxShadow = '';
      setTimeout(function () { ui.style.transition = ''; }, 400);
    }, 1200);

    const dockMs = Math.round((performance.now() - startTime) * 10) / 10;
    log('[redock] ✅ Panel relocated from body to XPath target in ' + dockMs + 'ms', 'success');
    showToast('Panel docked ✓', 'success', { noStop: true });
    return true;
  } catch (err) {
    logError('redock', '❌ Failed to relocate panel: ' + (err instanceof Error ? err.message : String(err)));
    return false;
  }
}

/** Reset dock state (called on teardown/re-bootstrap). */
export function resetRedockState(): void {
  redockState.docked = false;
  // PERF-4: bump generation so any in-flight pollUntil() bails on next tick.
  redockState.invalidate();
}

/** Whether the panel is currently docked into the XPath target. */
export function isRedocked(): boolean {
  return redockState.docked;
}
