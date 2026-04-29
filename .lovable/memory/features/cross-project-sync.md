---
name: Cross-Project Sync data layer
description: SharedAsset, AssetLink, ProjectGroup tables + migration v7 + library handler with sync engine, content hasher, version manager
type: feature
---

## Cross-Project Sync — Data Layer (Phase 1)

**Implemented**: 2026-04-09
**Spec**: `spec/21-app/02-features/misc-features/cross-project-sync.md` (READY v2.0.0)

### New Tables (Migration v7 — logs.db)
- `SharedAsset` — global reusable assets (prompts, scripts, chains, presets) with ContentHash (SHA-256)
- `AssetLink` — links between SharedAsset and Project with state: synced/pinned/detached
- `ProjectGroup` — named groups of related projects with shared settings
- `ProjectGroupMember` — junction table for group membership

### New Files
- `src/background/migration-v7-sql.ts` — migration v7 SQL statements
- `src/background/handlers/library-handler.ts` — full CRUD + sync engine + import/export
- `src/background/handlers/library-content-hasher.ts` — SHA-256 via Web Crypto
- `src/background/handlers/library-version-manager.ts` — semver bump/compare utilities

### Message Types (22 new)
LIBRARY_GET_ASSETS, LIBRARY_GET_ASSET, LIBRARY_SAVE_ASSET, LIBRARY_DELETE_ASSET,
LIBRARY_GET_LINKS, LIBRARY_SAVE_LINK, LIBRARY_DELETE_LINK, LIBRARY_SYNC_ASSET,
LIBRARY_PROMOTE_ASSET, LIBRARY_REPLACE_ASSET, LIBRARY_FORK_ASSET,
LIBRARY_GET_GROUPS, LIBRARY_SAVE_GROUP, LIBRARY_DELETE_GROUP,
LIBRARY_GET_GROUP_MEMBERS, LIBRARY_ADD_GROUP_MEMBER, LIBRARY_REMOVE_GROUP_MEMBER,
LIBRARY_EXPORT, LIBRARY_IMPORT

### Sync Rules (from spec §6)
- Synced links auto-overwrite on library update (no merge)
- Pinned links show "update available" badge
- Detached links are fully independent
- Delete library asset → synced/pinned links become detached (local copies preserved)
- Promote-back compares ContentHash: identical=no-op, different=Replace/Fork/Cancel

### Remaining (Phase 2 — UI)
- Library tab in Options sidebar
- AssetCard, VersionHistory, SyncBadge, PromoteDialog components
- ProjectGroupPanel component
