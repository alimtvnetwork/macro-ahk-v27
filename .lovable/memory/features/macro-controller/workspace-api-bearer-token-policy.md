# Memory: features/macro-controller/workspace-api-bearer-token-policy
Updated: 2026-03-22

Workspace APIs now enforce a strict bearer-token-required policy.

## Policy
- Endpoints such as:
  - `PUT /user/workspaces/:id` (rename)
  - `GET /user/workspaces` (workspace list/fetch)
  - `PUT /projects/:id/move-to-workspace` (move)
  must include `Authorization: Bearer <token>`.
- Cookie-only fallback is no longer allowed for workspace endpoints.

## Runtime behavior
1. Resolve token before request.
2. If missing, run one `recoverAuthOnce()` attempt.
3. If still missing, block request and surface `NO_BEARER_TOKEN` style error.
4. On 401, invalidate source and retry once after recovery.
5. On 403 permission errors, fail fast (no auth storm loops).

## Why
This removes inconsistent auth behavior, ensures requests are visible with explicit auth semantics, and prevents repeated unauthenticated workspace API failures.
