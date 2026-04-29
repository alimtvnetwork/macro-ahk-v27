/**
 * Remix Fetch — v2.217.0
 *
 * Thin wrapper around the marco-sdk's project-list and remix-init endpoints.
 * Owns:
 *   - `fetchWorkspaceProjectNames(wsId)` — returns lowercase Set for collision
 *     checks. Cached for 60s per workspace.
 *   - `submitRemix(...)` — POST /projects/{id}/remix/init.
 *
 * Per `mem://constraints/no-retry-policy` — no retries on failure; the UI
 * surfaces errors inline so the user can decide what to do.
 */

import { CREDIT_API_BASE } from './shared-state';
import { log } from './logging';
import { logError } from './error-utils';

interface ProjectsListResponse {
  projects?: Array<{ id?: string; name?: string }>;
}

interface RemixInitResponse {
  project_id?: string;
  id?: string;
  url?: string;
  redirect_url?: string;
  [key: string]: unknown;
}

interface CacheEntry {
  names: Set<string>;
  fetchedAt: number;
}

const PROJECTS_TTL_MS = 60 * 1000;
const cache: Record<string, CacheEntry> = {};

function getSdk(): MarcoSDKApiModule {
  const sdk = window.marco;
  if (!sdk || !sdk.api) {
    throw new Error('marco.api is not available — SDK not loaded');
  }
  return sdk.api;
}

/**
 * Fetch lowercase project names for a workspace. Used for remix-name
 * collision detection. Cached for 60 seconds per workspace.
 */
export async function fetchWorkspaceProjectNames(wsId: string, force = false): Promise<Set<string>> {
  if (!wsId) throw new Error('fetchWorkspaceProjectNames: wsId is required');
  const existing = cache[wsId];
  if (!force && existing && Date.now() - existing.fetchedAt < PROJECTS_TTL_MS) {
    return existing.names;
  }

  const api = getSdk();
  if (!api.projects || typeof api.projects.list !== 'function') {
    throw new Error('marco.api.projects.list is not available — SDK out of date');
  }

  log('[Remix] GET /workspaces/' + wsId + '/projects', 'delegate');
  const resp = await api.projects.list(wsId, { baseUrl: CREDIT_API_BASE });
  if (!resp.ok) {
    const preview = JSON.stringify(resp.data).substring(0, 200);
    logError('Remix', 'projects.list HTTP ' + resp.status + ': ' + preview);
    throw new Error('HTTP ' + resp.status + ' — ' + preview);
  }
  const data = resp.data as ProjectsListResponse;
  const list = Array.isArray(data.projects) ? data.projects : [];
  const names = new Set<string>();
  for (const p of list) {
    if (p && typeof p.name === 'string' && p.name.trim()) {
      names.add(p.name.trim().toLowerCase());
    }
  }
  cache[wsId] = { names, fetchedAt: Date.now() };
  log('[Remix] ✅ ' + names.size + ' existing project names fetched', 'success');
  return names;
}

/** Drop the cached project-name list for a workspace. */
export function clearProjectNamesCache(wsId?: string): void {
  if (wsId) { delete cache[wsId]; return; }
  for (const k of Object.keys(cache)) delete cache[k];
}

/** Submit the remix POST. Returns the new project id when the API supplies it. */
export async function submitRemix(opts: {
  projectId: string;
  workspaceId: string;
  projectName: string;
  includeHistory: boolean;
  includeCustomKnowledge: boolean;
}): Promise<{ newProjectId: string; redirectUrl: string; raw: RemixInitResponse }> {
  const api = getSdk();
  if (!api.remix || typeof api.remix.init !== 'function') {
    throw new Error('marco.api.remix.init is not available — SDK out of date');
  }
  log('[Remix] POST /projects/' + opts.projectId + '/remix/init → "' + opts.projectName + '"', 'delegate');
  const resp = await api.remix.init(opts.projectId, {
    workspaceId: opts.workspaceId,
    projectName: opts.projectName,
    includeHistory: opts.includeHistory,
    includeCustomKnowledge: opts.includeCustomKnowledge,
  }, { baseUrl: CREDIT_API_BASE });

  if (!resp.ok) {
    const preview = JSON.stringify(resp.data).substring(0, 250);
    logError('Remix', 'remix.init HTTP ' + resp.status + ': ' + preview);
    throw new Error('HTTP ' + resp.status + ' — ' + preview);
  }
  const data = resp.data as RemixInitResponse;
  const newProjectId = String(data.project_id || data.id || '');
  const redirectUrl = String(data.redirect_url || data.url || '');
  // Bust the cache so the new name shows up on the next collision check.
  clearProjectNamesCache(opts.workspaceId);
  return { newProjectId, redirectUrl, raw: data };
}
