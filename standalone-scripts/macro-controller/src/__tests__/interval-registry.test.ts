/**
 * Unit tests for the IntervalRegistry — verifies that interval counts go
 * up on register, down on clear, and the snapshot reports per-label totals.
 *
 * @see spec/22-app-issues/idle-loop-audit-2026-04-25.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  trackedSetInterval,
  trackedClearInterval,
  getIntervalSnapshot,
  resetIntervalRegistry,
} from '../interval-registry';

describe('IntervalRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetIntervalRegistry();
  });

  afterEach(() => {
    resetIntervalRegistry();
    vi.useRealTimers();
  });

  it('starts with an empty snapshot', () => {
    const snap = getIntervalSnapshot();
    expect(snap.total).toBe(0);
    expect(snap.byLabel).toEqual({});
  });

  it('increments total + per-label count on trackedSetInterval', () => {
    const a = trackedSetInterval('Test.a', () => undefined, 100);
    const b = trackedSetInterval('Test.a', () => undefined, 100);
    const c = trackedSetInterval('Test.b', () => undefined, 100);

    const snap = getIntervalSnapshot();
    expect(snap.total).toBe(3);
    expect(snap.byLabel).toEqual({ 'Test.a': 2, 'Test.b': 1 });

    trackedClearInterval(a);
    trackedClearInterval(b);
    trackedClearInterval(c);
  });

  it('decrements counts on trackedClearInterval and removes empty labels', () => {
    const a = trackedSetInterval('Test.solo', () => undefined, 100);

    expect(getIntervalSnapshot().byLabel['Test.solo']).toBe(1);

    trackedClearInterval(a);

    const snap = getIntervalSnapshot();
    expect(snap.total).toBe(0);
    expect(snap.byLabel['Test.solo']).toBeUndefined();
  });

  it('is a no-op when clearing null/undefined or unknown handles', () => {
    expect(() => trackedClearInterval(null)).not.toThrow();
    expect(() => trackedClearInterval(undefined)).not.toThrow();
    expect(getIntervalSnapshot().total).toBe(0);
  });

  it('reports oldestAgeMs based on the longest-running registered timer', () => {
    const a = trackedSetInterval('Test.old', () => undefined, 100);
    vi.advanceTimersByTime(5_000);
    const b = trackedSetInterval('Test.young', () => undefined, 100);

    const snap = getIntervalSnapshot();
    expect(snap.total).toBe(2);
    expect(snap.oldestAgeMs).toBeGreaterThanOrEqual(5_000);

    trackedClearInterval(a);
    trackedClearInterval(b);
  });
});
