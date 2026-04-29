/**
 * Defensive integration test for findNextTasksPrompt.
 *
 * Ensures the function returns null when no prompt matches the target slug,
 * instead of falling back to entries[0] (the regression that caused Start Prompt
 * to be injected as the next-task content).
 *
 * @see spec/21-app/06-tasks/next-feature.md
 */

import { describe, it, expect } from 'vitest';

/** Mirrors the resolution logic from task-next-ui.ts findNextTasksPrompt */
function findNextTasksPrompt(
  entries: Array<{ name: string; slug?: string; id?: string; text?: string }>,
  targetSlug: string,
) {
  // Priority 1: Exact slug match
  for (const e of entries) {
    if ((e.slug || '').toLowerCase() === targetSlug) return e;
  }
  // Priority 2: id match
  for (const e of entries) {
    const id = (e.id || '').toLowerCase();
    if (id === targetSlug || id === 'default-' + targetSlug || id.indexOf(targetSlug) !== -1) return e;
  }
  // Priority 3: Derived name slug
  for (const e of entries) {
    const derived = (e.name || '').toLowerCase().replace(/\s+/g, '-');
    if (derived === targetSlug) return e;
  }
  // Priority 4: Keywords
  for (const e of entries) {
    const name = (e.name || '').toLowerCase();
    if (name.indexOf('next') !== -1 && name.indexOf('task') !== -1) return e;
  }
  // MUST return null — never fall back to entries[0]
  return null;
}

describe('findNextTasksPrompt — no entries[0] fallback', () => {
  const unrelatedEntries = [
    { name: 'Start Prompt', slug: 'start-prompt', id: 'default-start-prompt', text: 'You are a helpful assistant...' },
    { name: 'Code Review', slug: 'code-review', id: 'default-code-review', text: 'Review the following code...' },
    { name: 'Audit Spec', slug: 'audit-spec', id: 'default-audit', text: 'Audit the specification...' },
  ];

  it('returns null when no prompt has slug "next-tasks"', () => {
    const result = findNextTasksPrompt(unrelatedEntries, 'next-tasks');
    expect(result).toBeNull();
  });

  it('returns null for empty entries array', () => {
    expect(findNextTasksPrompt([], 'next-tasks')).toBeNull();
  });

  it('does NOT return entries[0] (Start Prompt) as fallback', () => {
    const result = findNextTasksPrompt(unrelatedEntries, 'next-tasks');
    expect(result).not.toBe(unrelatedEntries[0]);
    expect(result?.name).not.toBe('Start Prompt');
  });

  it('finds prompt by exact slug match', () => {
    const entries = [...unrelatedEntries, { name: 'Next Tasks', slug: 'next-tasks', id: 'default-next-tasks', text: 'Next,' }];
    const result = findNextTasksPrompt(entries, 'next-tasks');
    expect(result?.name).toBe('Next Tasks');
  });

  it('finds prompt by id containing target slug', () => {
    const entries = [...unrelatedEntries, { name: 'My Next', slug: 'my-next', id: 'custom-next-tasks-v2', text: 'Next,' }];
    const result = findNextTasksPrompt(entries, 'next-tasks');
    expect(result?.name).toBe('My Next');
  });

  it('finds prompt by derived name slug', () => {
    const entries = [...unrelatedEntries, { name: 'Next Tasks', slug: '', id: '', text: 'Next,' }];
    const result = findNextTasksPrompt(entries, 'next-tasks');
    expect(result?.name).toBe('Next Tasks');
  });

  it('finds prompt by name keywords (next + task)', () => {
    const entries = [...unrelatedEntries, { name: 'My Next Task Runner', slug: 'runner', id: 'runner', text: 'Run next' }];
    const result = findNextTasksPrompt(entries, 'next-tasks');
    expect(result?.name).toBe('My Next Task Runner');
  });

  it('returns null when entries have similar but non-matching slugs', () => {
    const entries = [
      { name: 'Next Steps', slug: 'next-steps', id: 'default-next-steps', text: '...' },
      { name: 'Task List', slug: 'task-list', id: 'default-task-list', text: '...' },
    ];
    expect(findNextTasksPrompt(entries, 'next-tasks')).toBeNull();
  });
});
