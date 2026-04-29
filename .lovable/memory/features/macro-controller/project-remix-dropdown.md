---
name: project-remix-dropdown
description: Right-click + header split-button "Remix" + "Remix Next" dropdown with auto-incrementing V suffix, configurable defaults, pre-flight collision check
type: feature
---

# Project Remix Dropdown (v2.217.0)

Two new UI surfaces for the macro-controller's project-remix flow:

1. **Header split-button** — `🔀 Remix ▾` in the panel title bar (between
   version and auth badge). Main button opens the configuration modal; the
   ▾ arrow opens a 2-item dropdown.
2. **Right-click context menu** — adds `🔀 Remix Project…` and
   `⏭️ Remix Next` entries below `👥 Show Members` (only when the page has
   a project_id in URL).

Both surfaces feed the same two action handlers:

| Action       | Behavior |
|--------------|----------|
| Remix…       | Opens floating modal: ProjectName input + IncludeHistory + IncludeCustomKnowledge checkboxes + Confirm/Cancel |
| Remix Next   | Resolves next V suffix, pre-checks collisions, submits immediately, shows toast progress |

## API endpoints (added to marco-sdk)

```
GET  /workspaces/{wsId}/projects?limit=200       → projects.list
POST /projects/{projectId}/remix/init             → remix.init
```

`remix.init` body uses snake_case as required by the upstream API:

```json
{
  "include_history": false,
  "include_custom_knowledge": false,
  "workspace_id": "bR4AnDvBVV0FOu4FxqJJ",
  "project_name": "prompt-perfect-V6"
}
```

The SDK wrapper accepts camelCase from callers and converts internally.

## Next-Name Resolver (`remix-name-resolver.ts`)

**Casing rule chosen by user**: *Match input casing*.

| Input         | Output      | Notes |
|---------------|-------------|-------|
| `Foo`         | `Foo-V2`    | No suffix → uppercase V + configured separator |
| `Foo-V2`      | `Foo-V3`    | Increment, preserve uppercase V + dash |
| `foo-v2`      | `foo-v3`    | Lowercase v preserved |
| `Foo-V9`      | `Foo-V10`   | Multi-digit increment |
| `Foo_V3`      | `Foo_V4`    | Underscore separator preserved |
| `prompt-perfect-V6` (collision) | `prompt-perfect-V7`, then V8, … | Auto-increments through `existingNames` set up to `maxCollisionIncrements` |

Regex: `^(.*?)([-_ ]?)([Vv])(\d+)$` — captures base + separator + V/v + number.

## Collision pre-check

`fetchWorkspaceProjectNames(wsId)` calls `GET /workspaces/{wsId}/projects?limit=200`,
extracts lowercase `name` set, caches 60s per workspace. The resolver
increments the V number while the candidate is in the set, throwing if
`maxCollisionIncrements` (default 50) is exceeded.

## Config keys (`__MARCO_CONFIG__.remix`)

| Key                              | Default | Type    |
|----------------------------------|---------|---------|
| `defaultIncludeHistory`          | `false` | boolean |
| `defaultIncludeCustomKnowledge`  | `false` | boolean |
| `nextSuffixSeparator`            | `'-'`   | string  |
| `maxCollisionIncrements`         | `50`    | number  |

Resolved by `getRemixConfig()` per `mem://architecture/config-defaults-extraction`.
Constants live in `constants.ts` (`DEFAULT_REMIX_*`).

## Files

| File | Role |
|------|------|
| `marco-sdk/src/api-registry.ts` | `projects.list` + `remix.init` endpoint configs |
| `marco-sdk/src/api.ts` | `marco.api.projects.list()` + `marco.api.remix.init()` typed wrappers |
| `macro-controller/src/globals.d.ts` | `MarcoSDKApiProjects` + `MarcoSDKApiRemix` interfaces added to `MarcoSDKApiModule` |
| `macro-controller/src/constants.ts` | `DEFAULT_REMIX_*` named constants |
| `macro-controller/src/remix-config.ts` | `getRemixConfig()` resolver |
| `macro-controller/src/remix-name-resolver.ts` | Pure logic: `parseName`, `buildName`, `resolveNextName` |
| `macro-controller/src/remix-fetch.ts` | `fetchWorkspaceProjectNames` (60s cache) + `submitRemix` |
| `macro-controller/src/remix-modal.ts` | Floating modal with 3 fields + Confirm/Cancel |
| `macro-controller/src/remix-dropdown.ts` | `actionRemixManual`, `actionRemixNext`, `buildHeaderRemixSplitButton`, `showHeaderRemixDropdown` |
| `macro-controller/src/ui/panel-header.ts` | Mounts split button between version and auth badge |
| `macro-controller/src/ws-context-menu.ts` | Adds 2 right-click items (only when projectId present) |

## Lifecycle (Manual Remix)

1. User clicks `🔀 Remix` (header) or right-clicks workspace → `🔀 Remix Project…`
2. `actionRemixManual({ projectId, workspaceId, currentProjectName })` → `showRemixModal()`
3. Modal renders prefilled name + checkboxes (defaults from `RemixConfig`)
4. Confirm → validates non-empty name → POST `/projects/{id}/remix/init`
5. Success → toast `🔀 Remixed → "name"` + opens `redirect_url` in new tab
6. Error → inline error block in modal, popup stays open

## Lifecycle (Remix Next — automated)

1. User clicks ▾ → `⏭️ Remix Next` or right-click → `⏭️ Remix Next`
2. `actionRemixNext()` shows toast `🔀 Resolving next name…`
3. `fetchWorkspaceProjectNames(wsId)` (cached 60s)
4. `resolveNextName(currentName, existingNames, config)` → `{ name, collisionsResolved }`
5. POST submitted with config defaults for both checkboxes
6. Success → toast `✅ Remixed → "name"` + opens redirect URL
7. Failure → toast `❌ Remix Next failed: <message>`

## Edge cases handled

- Missing `projectId` (extension running outside a project page) → split-button shows toast "Remix unavailable — project/workspace not detected"; context-menu hides Remix entries entirely
- Empty project name in modal → inline error "Project name cannot be empty.", focus returns to input
- Server returns non-2xx → modal shows HTTP status + truncated body preview
- Collision storm (>50 increments) → throws clear error surfaced via toast
- `currentName` already has a V suffix → resolver starts at `current+1`, never duplicates
- Projects-list cache stale after a fresh remix → `submitRemix` busts the cache for that workspace
- SDK loaded but missing `projects`/`remix` modules → throws "SDK out of date" so user can refresh
