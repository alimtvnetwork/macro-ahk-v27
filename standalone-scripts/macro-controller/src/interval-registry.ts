/**
 * MacroLoop Controller — Interval Registry
 *
 * Lightweight tracker that wraps `setInterval` / `clearInterval` so the
 * extension can verify the interval-leak fixes hold in production.
 *
 * Design goals:
 *   - Zero behavior change vs. native timers when registry is unused.
 *   - O(1) register/unregister; bounded memory (one entry per live timer).
 *   - Per-label counts + total active count, with a periodic heartbeat log
 *     when the total is non-zero.
 *   - Snapshot exposed via the namespace API (`api.metrics.intervals()`).
 *
 * Usage:
 *   import { trackedSetInterval, trackedClearInterval } from './interval-registry';
 *   const id = trackedSetInterval('LoopEngine.cycle', cb, 1000);
 *   trackedClearInterval(id);
 *
 * @see spec/22-app-issues/idle-loop-audit-2026-04-25.md
 */

import { log } from './logging';

type Handle = ReturnType<typeof setInterval>;

interface Entry {
  readonly label: string;
  readonly periodMs: number;
  readonly startedAt: number;
}

/* ------------------------------------------------------------------ */
/*  Internal State                                                     */
/* ------------------------------------------------------------------ */

const entries = new Map<Handle, Entry>();
const labelCounts = new Map<string, number>();
let heartbeatTimer: Handle | null = null;
let heartbeatStarted = false;

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_LABEL = 'IntervalRegistry.heartbeat';

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface IntervalSnapshot {
  readonly total: number;
  readonly byLabel: Readonly<Record<string, number>>;
  readonly oldestAgeMs: number;
  readonly capturedAt: number;
}

/**
 * Register a new interval. Returns the native handle so callers can
 * still pass it to clearInterval if they bypass the registry — but
 * the canonical clear path is `trackedClearInterval`.
 */
export function trackedSetInterval(
  label: string,
  handler: () => void,
  periodMs: number,
): Handle {
  const handle = setInterval(handler, periodMs);
  entries.set(handle, { label, periodMs, startedAt: Date.now() });
  labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  ensureHeartbeat();
  return handle;
}

/**
 * Clear an interval that was registered via `trackedSetInterval`.
 * Safe to call with a handle the registry never saw — it falls through
 * to native clearInterval in that case.
 */
export function trackedClearInterval(handle: Handle | null | undefined): void {
  if (handle === null || handle === undefined) { return; }
  const entry = entries.get(handle);
  if (entry !== undefined) {
    entries.delete(handle);
    const next = (labelCounts.get(entry.label) ?? 1) - 1;
    if (next <= 0) { labelCounts.delete(entry.label); }
    else { labelCounts.set(entry.label, next); }
  }
  clearInterval(handle);
}

/** Read-only snapshot for diagnostics / namespace API. */
export function getIntervalSnapshot(): IntervalSnapshot {
  const now = Date.now();
  let oldestAgeMs = 0;
  for (const entry of entries.values()) {
    const age = now - entry.startedAt;
    if (age > oldestAgeMs) { oldestAgeMs = age; }
  }
  const byLabel: Record<string, number> = {};
  for (const [label, count] of labelCounts) { byLabel[label] = count; }
  return { total: entries.size, byLabel, oldestAgeMs, capturedAt: now };
}

/* ------------------------------------------------------------------ */
/*  Heartbeat                                                          */
/* ------------------------------------------------------------------ */

function ensureHeartbeat(): void {
  if (heartbeatStarted) { return; }
  heartbeatStarted = true;
  // Use native setInterval here (NOT trackedSetInterval) to avoid
  // counting the heartbeat itself in user-facing metrics.
  heartbeatTimer = setInterval(emitHeartbeat, HEARTBEAT_INTERVAL_MS);
}

function emitHeartbeat(): void {
  // User-visible metric only fires when something is actually running;
  // a quiet system stays quiet in the logs.
  if (entries.size === 0) { return; }
  const snap = getIntervalSnapshot();
  const labelSummary = Object.entries(snap.byLabel)
    .map(function ([label, count]) { return label + '=' + count; })
    .join(', ');
  log(
    'IntervalRegistry: ' + snap.total + ' active interval(s) — ' +
    labelSummary + ' — oldest=' + Math.round(snap.oldestAgeMs / 1000) + 's',
    'info',
  );
}

/** Stop the heartbeat (used in tests / teardown). Not normally called. */
export function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  heartbeatStarted = false;
}

/** Clear all tracked intervals. Test-only helper. */
export function resetIntervalRegistry(): void {
  for (const handle of entries.keys()) { clearInterval(handle); }
  entries.clear();
  labelCounts.clear();
  stopHeartbeat();
}

// Export the heartbeat label so test suites can filter it out.
export const INTERVAL_HEARTBEAT_LABEL = HEARTBEAT_LABEL;
