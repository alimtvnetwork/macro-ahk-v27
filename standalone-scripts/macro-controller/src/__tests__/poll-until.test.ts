/**
 * Unit tests for pollUntil utility in async-utils.ts
 *
 * @see spec/02-coding-guidelines/02-typescript-immutability-standards.md — Rule CQ18
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pollUntil } from '../async-utils';

 
describe('pollUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately when condition is truthy on first call', async () => {
    const promise = pollUntil(() => 'found', { intervalMs: 100, timeoutMs: 1000 });
    const result = await promise;

    expect(result).toBe('found');
  });

  it('resolves with the value when condition becomes truthy after polling', async () => {
    let callCount = 0;
    const condition = () => {
      callCount++;

      return callCount >= 3 ? 'delayed-result' : null;
    };

    const promise = pollUntil(condition, { intervalMs: 50, timeoutMs: 5000 });

    // First call is immediate (returns null), then poll twice more
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(50);

    const result = await promise;

    expect(result).toBe('delayed-result');
    expect(callCount).toBe(3);
  });

  it('resolves with null on timeout when condition never becomes truthy', async () => {
    const promise = pollUntil(() => null, { intervalMs: 100, timeoutMs: 300 });

    await vi.advanceTimersByTimeAsync(400);

    const result = await promise;

    expect(result).toBeNull();
  });

  it('calls onFound callback with elapsed time on immediate match', async () => {
    const onFound = vi.fn();

    const promise = pollUntil(() => 'instant', { onFound });
    const result = await promise;

    expect(result).toBe('instant');
    expect(onFound).toHaveBeenCalledWith(0);
  });

  it('calls onFound callback with elapsed time on delayed match', async () => {
    const onFound = vi.fn();
    let callCount = 0;

    const promise = pollUntil(
      () => { callCount++; return callCount >= 2 ? 'ok' : false; },
      { intervalMs: 100, timeoutMs: 5000, onFound },
    );

    await vi.advanceTimersByTimeAsync(100);
    await promise;

    expect(onFound).toHaveBeenCalledTimes(1);
    expect(onFound.mock.calls[0][0]).toBeGreaterThanOrEqual(0);
  });

  it('calls onTimeout callback when polling times out', async () => {
    const onTimeout = vi.fn();

    const promise = pollUntil(() => false, {
      intervalMs: 50,
      timeoutMs: 150,
      onTimeout,
    });

    await vi.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toBeNull();
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not call onTimeout when condition is met before timeout', async () => {
    const onTimeout = vi.fn();
    let callCount = 0;

    const promise = pollUntil(
      () => { callCount++; return callCount >= 2 ? 'ok' : null; },
      { intervalMs: 50, timeoutMs: 500, onTimeout },
    );

    await vi.advanceTimersByTimeAsync(50);
    await promise;

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('uses default intervalMs (200) and timeoutMs (5000)', async () => {
    let callCount = 0;

    const promise = pollUntil(() => {
      callCount++;

      return callCount >= 3 ? 'default-timing' : null;
    });

    // Immediate call (1), then advance 200ms (2), then 200ms (3)
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;

    expect(result).toBe('default-timing');
  });

  it('returns typed result matching the condition return type', async () => {
    interface TestItem { id: number; name: string }

    const item: TestItem = { id: 42, name: 'test' };
    const promise = pollUntil<TestItem>(() => item);
    const result = await promise;

    expect(result).toEqual({ id: 42, name: 'test' });
  });

  it('stops polling after condition becomes truthy (no extra calls)', async () => {
    const condition = vi.fn()
      .mockReturnValueOnce(null)  // immediate
      .mockReturnValueOnce(null)  // poll 1
      .mockReturnValueOnce('done') // poll 2 — match
      .mockReturnValueOnce('extra'); // should never be called

    const promise = pollUntil(condition, { intervalMs: 50, timeoutMs: 5000 });

    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(50);
    await promise;

    // Advance more — should not poll again
    await vi.advanceTimersByTimeAsync(200);

    expect(condition).toHaveBeenCalledTimes(3);
  });
});
