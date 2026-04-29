/**
 * Remix Config Resolver — v2.217.0
 *
 * Reads `__MARCO_CONFIG__.remix` and merges with named-constant defaults.
 * Per `mem://architecture/config-defaults-extraction` — no inline defaults
 * inside feature modules.
 *
 * Config keys (all optional):
 *   remix.defaultIncludeHistory          (boolean)
 *   remix.defaultIncludeCustomKnowledge  (boolean)
 *   remix.nextSuffixSeparator            (string, e.g. '-' or '')
 *   remix.maxCollisionIncrements         (number, safety cap)
 */

import {
  DEFAULT_REMIX_INCLUDE_HISTORY,
  DEFAULT_REMIX_INCLUDE_CUSTOM_KNOWLEDGE,
  DEFAULT_REMIX_NEXT_SUFFIX_SEPARATOR,
  DEFAULT_REMIX_NEXT_MAX_COLLISION_INCREMENTS,
} from './constants';

export interface RemixConfig {
  defaultIncludeHistory: boolean;
  defaultIncludeCustomKnowledge: boolean;
  nextSuffixSeparator: string;
  maxCollisionIncrements: number;
}

interface RemixConfigInput {
  defaultIncludeHistory?: boolean;
  defaultIncludeCustomKnowledge?: boolean;
  nextSuffixSeparator?: string;
  maxCollisionIncrements?: number;
}

function readRaw(): Partial<RemixConfigInput> {
  const cfg = (window.__MARCO_CONFIG__ || {}) as Record<string, unknown>;
  const remix = cfg.remix as Partial<RemixConfigInput> | undefined;
  return remix || {};
}

/** Resolved remix config with named-constant defaults applied. */
export function getRemixConfig(): RemixConfig {
  const raw = readRaw();
  return {
    defaultIncludeHistory: typeof raw.defaultIncludeHistory === 'boolean'
      ? raw.defaultIncludeHistory
      : DEFAULT_REMIX_INCLUDE_HISTORY,
    defaultIncludeCustomKnowledge: typeof raw.defaultIncludeCustomKnowledge === 'boolean'
      ? raw.defaultIncludeCustomKnowledge
      : DEFAULT_REMIX_INCLUDE_CUSTOM_KNOWLEDGE,
    nextSuffixSeparator: typeof raw.nextSuffixSeparator === 'string'
      ? raw.nextSuffixSeparator
      : DEFAULT_REMIX_NEXT_SUFFIX_SEPARATOR,
    maxCollisionIncrements: typeof raw.maxCollisionIncrements === 'number' && raw.maxCollisionIncrements > 0
      ? Math.floor(raw.maxCollisionIncrements)
      : DEFAULT_REMIX_NEXT_MAX_COLLISION_INCREMENTS,
  };
}
