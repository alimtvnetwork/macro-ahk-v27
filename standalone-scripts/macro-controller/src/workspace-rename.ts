/**
 * MacroLoop Controller — Workspace Rename (barrel)
 *
 * Phase 5: Split into focused sub-modules:
 *   - rename-forbidden-cache.ts  (forbidden workspace cache)
 *   - rename-template.ts         (numbering template engine)
 *   - rename-api.ts              (single rename PUT call)
 *   - rename-bulk.ts             (bulk rename, undo, history, delay)
 *   - rename-preset-store.ts     (IndexedDB-backed preset CRUD)
 *
 * This barrel preserves backward compatibility for existing imports.
 */

export {
  loadForbiddenRenameCache,
  isRenameForbidden,
  getForbiddenCount,
  clearForbiddenRenameCache,
  addForbidden,
  removeForbidden,
  hasForbidden,
} from './rename-forbidden-cache';

export { applyRenameTemplate } from './rename-template';

export { renameWorkspace } from './rename-api';

export {
  getRenameDelayMs,
  setRenameDelayMs,
  cancelRename,
  isRenameCancelled,
  getRenameAvgOpMs,
  getRenameHistory,
  updateUndoBtnVisibility,
  bulkRenameWorkspaces,
  undoLastRename,
} from './rename-bulk';

export {
  type RenamePreset,
  type RenamePresetStore,
  getRenamePresetStore,
  createDefaultPreset,
} from './rename-preset-store';
