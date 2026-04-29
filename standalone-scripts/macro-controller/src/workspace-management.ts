/**
 * Workspace Management — barrel re-export (module splitting).
 *
 * Re-exports all public symbols from ws-move.ts and ws-adjacent.ts
 * to maintain backward compatibility for consumer imports.
 */

export { moveToWorkspace, updateLoopMoveStatus, verifyWorkspaceSessionAfterFailure } from './ws-move';
export { moveToAdjacentWorkspace, moveToAdjacentWorkspaceCached } from './ws-adjacent';
