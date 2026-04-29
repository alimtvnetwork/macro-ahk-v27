/**
 * MacroLoop Controller — Page-side Workspace Responder
 *
 * Listens for `GET_DETECTED_WORKSPACE` requests posted to the page from
 * the content script (which itself is forwarding a `chrome.tabs.sendMessage`
 * sent by the background `open-tabs-handler`). Responds with a snapshot of
 * the macro-controller's currently detected workspace + project so that the
 * Macro Controller's "Open Lovable Tabs" panel can show what each open
 * Lovable tab actually thinks its workspace is — independent of the
 * tabInjections in-memory map maintained by background state-manager.
 *
 * Runs in MAIN world. Pure window.postMessage based — no chrome.* access.
 *
 * Protocol:
 *   request:  { source: 'marco-extension-request', type: 'GET_DETECTED_WORKSPACE', requestId }
 *   response: { source: 'marco-controller-response', type: 'GET_DETECTED_WORKSPACE',
 *               requestId, payload: DetectedWorkspaceSnapshot }
 */

import { state } from './shared-state';
import { extractProjectIdFromUrl } from './workspace-detection';
import { getCachedWorkspaceName, getCachedWorkspaceId } from './workspace-cache';
import { logError } from './error-utils';

const REQUEST_SOURCE = 'marco-extension-request';
const RESPONSE_SOURCE = 'marco-controller-response';
const REQUEST_TYPE = 'GET_DETECTED_WORKSPACE';

export interface DetectedWorkspaceSnapshot {
    readonly workspaceName: string;
    readonly workspaceId: string;
    readonly projectId: string | null;
    readonly source: 'api' | 'cache' | 'dom' | 'none';
    readonly capturedAt: string;
}

let isRegistered = false;

export function registerPageWorkspaceResponder(): void {
    if (isRegistered) return;
    isRegistered = true;

    window.addEventListener('message', function (event: MessageEvent): void {
        if (event.source !== window) return;

        const data = event.data as Record<string, unknown> | null;
        if (!data) return;
        if (data.source !== REQUEST_SOURCE) return;
        if (data.type !== REQUEST_TYPE) return;

        const requestId = typeof data.requestId === 'string' ? data.requestId : null;

        try {
            const snapshot = buildSnapshot();
            window.postMessage({
                source: RESPONSE_SOURCE,
                type: REQUEST_TYPE,
                requestId: requestId,
                payload: snapshot,
            }, '*');
        } catch (e) {
            logError('pageWorkspaceResponder', 'Failed to build workspace snapshot', e);
            window.postMessage({
                source: RESPONSE_SOURCE,
                type: REQUEST_TYPE,
                requestId: requestId,
                payload: null,
                errorMessage: e instanceof Error ? e.message : String(e),
            }, '*');
        }
    });
}

function buildSnapshot(): DetectedWorkspaceSnapshot {
    const wsName = state.workspaceName || '';
    const wsId = getCachedWorkspaceId();
    const projectId = extractProjectIdFromUrl();

    let source: DetectedWorkspaceSnapshot['source'] = 'none';
    if (state.workspaceFromApi) source = 'api';
    else if (state.workspaceFromCache && wsName) source = 'cache';
    else if (state.projectNameFromDom) source = 'dom';

    // Fallback: cached value present but state hasn't been hydrated (very early boot)
    const finalName = wsName || getCachedWorkspaceName();

    return {
        workspaceName: finalName,
        workspaceId: wsId,
        projectId: projectId,
        source: source,
        capturedAt: new Date().toISOString(),
    };
}
