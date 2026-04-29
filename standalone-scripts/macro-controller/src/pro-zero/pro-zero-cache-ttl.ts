/**
 * pro-zero-cache-ttl — resolve the IndexedDB cache TTL from Settings.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §9.1
 *
 * Priority: chrome.storage.local override (Settings) → constants default.
 * Always returns a clamped finite minutes value within configured bounds.
 */

import { getSettingsOverrides } from '../settings-store';
import {
    PRO_ZERO_CACHE_TTL_DEFAULT_MIN,
    PRO_ZERO_CACHE_TTL_MIN_BOUND,
    PRO_ZERO_CACHE_TTL_MAX_BOUND,
} from './pro-zero-constants';

interface ProZeroOverridesShape {
    proZeroCreditBalanceCacheTtlMinutes?: number;
}

function readOverrideMinutes(): number | undefined {
    const ovr = getSettingsOverrides() as unknown as ProZeroOverridesShape;
    const v = ovr.proZeroCreditBalanceCacheTtlMinutes;

    return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function clamp(min: number): number {
    if (min < PRO_ZERO_CACHE_TTL_MIN_BOUND) return PRO_ZERO_CACHE_TTL_MIN_BOUND;
    if (min > PRO_ZERO_CACHE_TTL_MAX_BOUND) return PRO_ZERO_CACHE_TTL_MAX_BOUND;

    return Math.floor(min);
}

export function getProZeroCacheTtlMinutes(): number {
    const override = readOverrideMinutes();
    if (override !== undefined) return clamp(override);

    return PRO_ZERO_CACHE_TTL_DEFAULT_MIN;
}

export function getProZeroCacheTtlMs(): number {
    return getProZeroCacheTtlMinutes() * 60_000;
}
