/**
 * Constants for the pro_0 credit-balance flow.
 *
 * Spec: spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md §5
 *
 * Endpoint paths are templates with `{WorkspaceId}` placeholders. Header keys
 * and the redaction sentinel are colocated so no magic strings appear in the
 * fetch client, cache, or logger.
 */

export const WORKSPACES_ENDPOINT_TEMPLATE = '/workspaces/{WorkspaceId}';
export const CREDIT_BALANCE_ENDPOINT_TEMPLATE = '/workspaces/{WorkspaceId}/credit-balance';

export const HEADER_AUTHORIZATION = 'Authorization';
export const HEADER_CONTENT_TYPE = 'Content-Type';
export const HEADER_ACCEPT = 'Accept';

export const REDACTED_TOKEN_PLACEHOLDER = 'Bearer <REDACTED>';
export const WORKSPACE_ID_PLACEHOLDER = '{WorkspaceId}';

/** Default cache TTL for the pro_0 credit-balance IndexedDB cache (minutes). */
export const PRO_ZERO_CACHE_TTL_DEFAULT_MIN = 10;
export const PRO_ZERO_CACHE_TTL_MIN_BOUND = 1;
export const PRO_ZERO_CACHE_TTL_MAX_BOUND = 1440;

/** IndexedDB DB / store names for the pro_0 cache. */
export const PRO_ZERO_DB_NAME = 'marco_pro_zero_credit_balance';
export const PRO_ZERO_DB_STORE = 'entries';
export const PRO_ZERO_DB_VERSION = 1;

/** SQLite-backed kv key prefix for the Workspaces row sink. */
export const SQLITE_WORKSPACES_KEY_PREFIX = 'pro_zero_workspaces.';

/** Wire-string for the only plan that triggers the new branch. */
export const WIRE_PLAN_PRO_ZERO = 'pro_0';
