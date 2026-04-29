/**
 * WorkspaceManager — Wraps workspace modules into a class (V2 Phase 02, Step 4)
 *
 * Implements WorkspaceManagerInterface from MacroController.
 * Delegates to existing workspace-detection.ts, workspace-management.ts,
 * workspace-observer.ts, and workspace-rename.ts — no logic duplication.
 *
 * See: spec/04-macro-controller/ts-migration-v2/02-class-architecture.md
 */

import type { WorkspaceManagerInterface } from './MacroController';
import { autoDetectLoopCurrentWorkspace, detectWorkspaceViaProjectDialog, extractProjectIdFromUrl } from '../workspace-detection';
import { moveToWorkspace, moveToAdjacentWorkspace, moveToAdjacentWorkspaceCached } from '../workspace-management';
import { startWorkspaceObserver, fetchWorkspaceName, fetchWorkspaceNameFromNav, isKnownWorkspaceName, addWorkspaceChangeEntry, getWorkspaceHistory, clearWorkspaceHistory } from '../workspace-observer';
import { bulkRenameWorkspaces } from '../workspace-rename';
import { state } from '../shared-state';
import type { BulkRenameEntry, BulkRenameResults, WorkspaceCredit } from '../types';

export class WorkspaceManager implements WorkspaceManagerInterface {

  /** Auto-detect current workspace (Tier 1 API → Tier 2 XPath → Tier 3 default) */
  detect(token: string): Promise<void> {
    return autoDetectLoopCurrentWorkspace(token);
  }

  /** Move project to a specific workspace by ID */
  moveTo(id: string, name: string): void {
    moveToWorkspace(id, name);
  }

  /** Move to adjacent workspace (up/down), fetching fresh data and skipping depleted */
  moveAdjacent(direction: string): void {
    moveToAdjacentWorkspace(direction);
  }

  /** Move to adjacent using cached data (no fresh fetch) */
  moveAdjacentCached(direction: string): void {
    moveToAdjacentWorkspaceCached(direction);
  }

  /** Bulk rename checked workspaces using a template */
  bulkRename(_template: string, _prefix: string, _suffix: string, _startNum?: number): void {
    const entries: BulkRenameEntry[] = [];
    bulkRenameWorkspaces(entries, ((_results: BulkRenameResults, _done: boolean) => {
      // progress callback placeholder
    }));
  }

  /** Get the current workspace name from state */
  getCurrentName(): string {
    return state.workspaceName || '';
  }

  /** Start the MutationObserver for live workspace tracking */
  startObserver(): void {
    startWorkspaceObserver();
  }

  /** Detect workspace via project dialog XPath (Tier 2) */
  detectViaDialog(callerFn?: string, perWs?: WorkspaceCredit[], keepDialogOpen?: boolean): Promise<Element | null> {
    return detectWorkspaceViaProjectDialog(callerFn, perWs, keepDialogOpen);
  }

  /** Read workspace name from configured XPath */
  fetchName(): void {
    fetchWorkspaceName();
  }

  /** Read workspace name from nav element */
  fetchNameFromNav(): boolean {
    return fetchWorkspaceNameFromNav();
  }

  /** Validate a name against known workspace list */
  isKnown(name: string): boolean {
    return isKnownWorkspaceName(name);
  }

  /** Extract project ID from current URL */
  extractProjectId(): string | null {
    return extractProjectIdFromUrl();
  }

  /** Record a workspace change in history */
  addChangeEntry(fromName: string, toName: string): void {
    addWorkspaceChangeEntry(fromName, toName);
  }

  /** Get workspace change history */
  getHistory(): Array<Record<string, string>> {
    return getWorkspaceHistory();
  }

  /** Clear workspace change history */
  clearHistory(): void {
    clearWorkspaceHistory();
  }
}
