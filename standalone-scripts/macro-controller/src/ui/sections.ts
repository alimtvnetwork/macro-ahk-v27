/**
 * MacroLoop Controller — UI Sections (Barrel)
 *
 * Re-exports all section builders for backward compatibility.
 * Sub-modules: section-collapsible, section-ws-history, section-auth-diag, auth-jwt-utils.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

export { createCollapsibleSection } from './section-collapsible';
export type { CollapsibleResult } from './section-collapsible';

export { createWsHistorySection } from './section-ws-history';
export type { WsHistoryDeps, WsHistoryResult } from './section-ws-history';

export { createAuthDiagRow, recordRefreshOutcome } from './section-auth-diag';
export type { AuthDiagDeps, AuthDiagResult } from './section-auth-diag';
