---
name: workspace-members-panel
description: Right-click "Show Members" panel listing top-20 active workspace members sorted by total credits used, all 8 server fields rendered
type: feature
---

# Workspace Members Panel (v2.216.0)

Right-click any workspace row in the macro-controller's workspace dropdown
and pick **👥 Show Members** to open a floating panel listing the active
members of that workspace, sorted by `total_credits_used` (descending).

## What it produces

Floating panel anchored at the right-click coordinates with:

```
┌─ 👥 WorkspaceName                            [↻] [✕]
│  top 20 of N · sorted by credits used
├─ 1. Alim                       [ADMIN]            6.9 cr
│     alim.karim@…                          Period: 6.9
│     @alim_ra            Joined 08 Feb 26 · Invited 08 Feb 26
│  2. …
└─ (scrollable, max-height 380px)
```

- Numeric prefix (1. 2. 3.) shows ranking by credits used.
- Role badge color: admin/owner = amber, editor/developer = sky, viewer = slate.
- Credit totals are formatted with `k` suffix above 1000 and 1-decimal precision
  for fractional values (`6.9 cr`).
- Email is truncated with `text-overflow:ellipsis` and a `title=` tooltip.
- All 8 server fields are rendered: `display_name`, `username`, `email`,
  `role`, `total_credits_used`, `total_credits_used_in_billing_period`,
  `joined_at`, `invited_at`. (`user_id` is in the username row's `title=`.)

## API endpoint

`GET https://api.lovable.dev/workspaces/{wsId}/memberships/search?status=active&limit=20`

Registered in `marco-sdk/src/api-registry.ts` under `memberships.search` and
exposed as `marco.api.memberships.search(wsId, options)`. The query string is
baked into the URL template — `resolveUrl()` only handles `{path}` params, not
real query params, but the literal `?status=active&limit=20` survives the
template substitution unchanged.

Auth: bearer token resolved by the SDK HTTP client (`getBearerToken()`).
Timeout: 10 000 ms. **No retries** (per `mem://constraints/no-retry-policy`).

## Sample response

```json
{
  "members": [
    {
      "user_id": "FP3OOftEhoZ8ebYFGQDXhsaG6Bd2",
      "username": "alim_ra",
      "role": "admin",
      "total_credits_used": 6.9,
      "total_credits_used_in_billing_period": 6.9,
      "invited_at": "2026-02-08T07:29:52Z",
      "email": "alim.karim@riseup-asia.com",
      "display_name": "Alim",
      "joined_at": "2026-02-08T07:52:37Z"
    }
  ],
  "total": 1,
  "limit": 1,
  "offset": 0,
  "has_more": false,
  "is_member": false
}
```

## Caching

5-minute TTL per workspace stored in a module-level `Record<string, CacheEntry>`
inside `ws-members-fetch.ts`. The panel's `↻` button calls
`clearMembersCache(wsId)` then re-fetches. Cache is process-local — survives
panel close/reopen but not page reload.

## Lifecycle

1. Right-click → `showWsContextMenu` → "Show Members" item → `showWsMembersPanel(wsId, wsName, x, y)`
2. Panel mounts at `(x, y)`, viewport-clamped, renders **loading** state
3. `fetchWorkspaceMembers(wsId)` → resolves to sorted list → renders **success**
4. On error → renders **error** state with the HTTP status + truncated body
5. Click outside / Esc / ✕ button → `hideWsMembersPanel()` detaches listeners
6. Outside-click handler is attached on `mousedown` capture-phase with a
   10 ms delay so the opening right-click doesn't immediately dismiss

## Files

- `standalone-scripts/marco-sdk/src/api-registry.ts` — `memberships.search` endpoint config
- `standalone-scripts/marco-sdk/src/api.ts` — `memberships.search()` typed wrapper + `MarcoApiModule.memberships`
- `standalone-scripts/macro-controller/src/globals.d.ts` — `MarcoSDKApiMemberships` interface added to `MarcoSDKApiModule`
- `standalone-scripts/macro-controller/src/ws-members-fetch.ts` — fetch + sort + cache + types
- `standalone-scripts/macro-controller/src/ws-members-panel.ts` — single-mount floating panel UI
- `standalone-scripts/macro-controller/src/ws-context-menu.ts` — adds the "👥 Show Members" entry

## Edge cases handled

- Missing `display_name` → falls back to `username` → `email` → `user_id`
- Missing `total_credits_used*` → coerced to 0 via `safeNumber()` (handles null, undefined, string)
- Empty `members` array → "No active members." empty state
- Server returns non-2xx → throws `Error('HTTP <status> — <bodyPreview>')`, panel renders error block
- `marco.api.memberships` undefined (SDK not loaded) → throws explicit error
- Panel closed mid-fetch → render is a no-op (`document.getElementById(PANEL_ID)` guard)
- Right-click coordinates near viewport edge → `positionPanel()` clamps to ≥8 px margin
