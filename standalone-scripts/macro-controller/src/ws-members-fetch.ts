/**
 * Workspace Members Fetch — v2.216.0
 *
 * Fetches active members of a workspace via
 *   GET /workspaces/{wsId}/memberships/search?status=active&limit=20
 *
 * Returns members sorted by `total_credits_used` (descending) so the most
 * expensive contributors surface first. Cached per workspace for the lifetime
 * of the SDK instance — callers explicitly invalidate via `clearMembersCache`.
 *
 * No retries (per `mem://constraints/no-retry-policy` — fail-fast). Auth
 * token resolution and refresh are handled inside the SDK's HTTP client.
 *
 * @see spec/22-app-issues/workspace-members-tooltip
 */

import { CREDIT_API_BASE } from './shared-state';
import { log } from './logging';
import { logError } from './error-utils';

/** A single workspace member as returned by the search API. */
export interface WorkspaceMember {
  user_id: string;
  username: string;
  role: string;
  total_credits_used: number;
  total_credits_used_in_billing_period: number;
  invited_at: string;
  email: string;
  display_name: string;
  joined_at: string;
}

/** Server response envelope for the memberships search endpoint. */
interface MembershipsSearchResponse {
  members?: WorkspaceMember[];
  total?: number;
  limit?: number;
  offset?: number;
  has_more?: boolean;
}

/** Cache entry — sorted, ready to render. */
interface CacheEntry {
  members: WorkspaceMember[];
  total: number;
  fetchedAt: number;
}

const cache: Record<string, CacheEntry> = {};

/** Default cache TTL (5 minutes). */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Defensive numeric coercion — server occasionally returns null/undefined for
 * `total_credits_used*` fields. Treat missing values as 0 for sort purposes.
 */
function safeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Normalize one server member into a fully-typed WorkspaceMember. */
function normalizeMember(raw: Record<string, unknown>): WorkspaceMember {
  return {
    user_id: String(raw.user_id ?? ''),
    username: String(raw.username ?? ''),
    role: String(raw.role ?? ''),
    total_credits_used: safeNumber(raw.total_credits_used),
    total_credits_used_in_billing_period: safeNumber(raw.total_credits_used_in_billing_period),
    invited_at: String(raw.invited_at ?? ''),
    email: String(raw.email ?? ''),
    display_name: String(raw.display_name ?? ''),
    joined_at: String(raw.joined_at ?? ''),
  };
}

/**
 * Fetch active members for the given workspace. Returns cached data when
 * fresh; otherwise issues a network call. Caller should `await` this.
 *
 * Throws on any non-2xx HTTP status, missing SDK, or network failure. The
 * panel UI catches and renders an error state.
 */
export async function fetchWorkspaceMembers(wsId: string, force = false): Promise<CacheEntry> {
  if (!wsId) throw new Error('fetchWorkspaceMembers: wsId is required');

  const existing = cache[wsId];
  if (!force && existing && Date.now() - existing.fetchedAt < CACHE_TTL_MS) {
    return existing;
  }

  const sdk = window.marco;
  if (!sdk || !sdk.api || !sdk.api.memberships) {
    throw new Error('marco.api.memberships is not available — SDK not loaded');
  }

  log('[Members] GET /workspaces/' + wsId + '/memberships/search', 'delegate');

  const resp = await sdk.api.memberships.search(wsId, { baseUrl: CREDIT_API_BASE });

  if (!resp.ok) {
    const bodyPreview = JSON.stringify(resp.data).substring(0, 200);
    logError('Members', 'memberships.search HTTP ' + resp.status + ': ' + bodyPreview);
    throw new Error('HTTP ' + resp.status + ' — ' + bodyPreview);
  }

  const data = resp.data as MembershipsSearchResponse;
  const rawMembers = Array.isArray(data.members) ? data.members : [];
  const normalized = rawMembers.map(function (m) {
    return normalizeMember(m as unknown as Record<string, unknown>);
  });
  // Sort by total credits used descending — top spenders first.
  normalized.sort(function (a, b) {
    return b.total_credits_used - a.total_credits_used;
  });

  const entry: CacheEntry = {
    members: normalized,
    total: typeof data.total === 'number' ? data.total : normalized.length,
    fetchedAt: Date.now(),
  };
  cache[wsId] = entry;
  log('[Members] ✅ ' + normalized.length + ' members (total=' + entry.total + ')', 'success');
  return entry;
}

/** Drop the cache entry for a workspace (or all when wsId omitted). */
export function clearMembersCache(wsId?: string): void {
  if (wsId) {
    delete cache[wsId];
    return;
  }
  for (const key of Object.keys(cache)) {
    delete cache[key];
  }
}

/** Read-only peek at cached members — used by the panel for instant render. */
export function peekCachedMembers(wsId: string): CacheEntry | null {
  return cache[wsId] || null;
}
