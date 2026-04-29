/**
 * Macro Controller — Type Definitions (barrel re-export)
 *
 * Phase 5E: Split into config-types.ts, credit-types.ts, workspace-types.ts, ui-types.ts.
 * Phase 8: Added enum constant groups (dom-ids, data-attrs, style-ids, storage-keys, api-paths,
 *          prompt-cache-keys, label-constants, css-fragments).
 * This barrel preserves backward-compatible imports from './types'.
 * See: spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

export * from './config-types';
export * from './credit-types';
export * from './workspace-types';
export * from './ui-types';
export * from './dom-ids';
export * from './data-attrs';
export * from './style-ids';
export * from './storage-keys';
export * from './api-paths';
export * from './prompt-cache-keys';
export * from './label-constants';
export * from './css-fragments';
