# Spec: Cross-Project Sync — Shared Assets & Linked Projects

**Version**: 2.0.0  
**Status**: READY  
**Created**: 2026-03-26  
**Matured**: 2026-04-07
**Created**: 2026-03-26  

---

## 1. Problem Statement

Users managing multiple projects duplicate prompts, scripts, and settings across each one. There's no mechanism to share assets between projects, sync changes, or link related projects together.

---

## 2. Features

### 2.1 Shared Asset Library

A global (non-project-specific) asset pool for reusable items:

| Asset Type | Description |
|------------|-------------|
| Prompts | Reusable prompt templates |
| Scripts | Utility scripts usable across projects |
| Chains | Automation chains (from spec/21) |
| Settings Presets | Bundled configuration snapshots |

### 2.2 Asset Linking Model

```
Global Library
  └── SharedPrompt "code-review" v2.1
        ├── linked → Project A (uses v2.1)
        ├── linked → Project B (uses v2.0, update available)
        └── linked → Project C (detached, local copy)
```

Three link states:
- **Synced**: auto-updates when library version changes
- **Pinned**: locked to a specific version
- **Detached**: local copy, no further updates

### 2.3 Project Groups

Related projects can be grouped:

```json
{
  "groupName": "Client X",
  "projects": ["proj-uuid-1", "proj-uuid-2", "proj-uuid-3"],
  "sharedSettings": {
    "storeUrl": "https://...",
    "theme": "dark"
  }
}
```

Group-level settings cascade to member projects unless overridden locally.

---

## 3. UI Design

### 3.1 Library Tab

New "Library" tab in Options sidebar:

```
┌──────────────────────────────────────────┐
│ 📚 Shared Library                         │
├──────────────────────────────────────────┤
│ [Prompts] [Scripts] [Chains] [Presets]   │
│                                          │
│ ┌────────────────────────────────────┐   │
│ │ 📝 code-review          v2.1      │   │
│ │ Used in: Project A, B             │   │
│ │ [Edit] [Version History] [Delete] │   │
│ ├────────────────────────────────────┤   │
│ │ 📝 fix-errors            v1.0     │   │
│ │ Used in: Project A                │   │
│ │ [Edit] [Version History] [Delete] │   │
│ └────────────────────────────────────┘   │
│                                          │
│ [+ Add to Library from Project ▾]        │
└──────────────────────────────────────────┘
```

### 3.2 Sync Status in Project View

In the project's Prompts/Scripts list, linked items show sync status:

```
📝 code-review  🔗 v2.1 ✅ synced
📝 fix-errors   📌 v1.0 (pinned)
📝 my-custom    ── local only
```

### 3.3 Project Groups Panel

```
┌─────────────────────────────┐
│ 📂 Project Groups           │
├─────────────────────────────┤
│ ▸ Client X (3 projects)     │
│ ▸ Personal (5 projects)     │
│ ▸ Experiments (2 projects)  │
│                             │
│ [+ New Group]               │
└─────────────────────────────┘
```

---

## 4. Data Model

### 4.1 New Tables

```sql
CREATE TABLE SharedAsset (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  Type TEXT NOT NULL,          -- 'prompt' | 'script' | 'chain' | 'preset'
  Name TEXT NOT NULL,
  Slug TEXT UNIQUE NOT NULL,
  ContentJson TEXT NOT NULL,
  Version TEXT NOT NULL DEFAULT '1.0.0',
  CreatedAt TEXT DEFAULT (datetime('now')),
  UpdatedAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE AssetLink (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  SharedAssetId INTEGER NOT NULL REFERENCES SharedAsset(Id),
  ProjectId INTEGER NOT NULL REFERENCES Project(Id),
  LinkState TEXT NOT NULL DEFAULT 'synced',  -- synced | pinned | detached
  PinnedVersion TEXT,
  LocalOverrideJson TEXT,
  UNIQUE(SharedAssetId, ProjectId)
);

CREATE TABLE ProjectGroup (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  Name TEXT NOT NULL,
  SharedSettingsJson TEXT,
  CreatedAt TEXT DEFAULT (datetime('now'))
);

CREATE TABLE ProjectGroupMember (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  GroupId INTEGER NOT NULL REFERENCES ProjectGroup(Id),
  ProjectId INTEGER NOT NULL REFERENCES Project(Id),
  UNIQUE(GroupId, ProjectId)
);
```

---

## 5. Sync Engine

```
On Library Asset Update (v2.0 → v2.1):
  ├── Find all AssetLinks where LinkState = 'synced'
  ├── For each: update project's local copy with new content
  ├── Show toast: "Updated 'code-review' in 2 projects"
  │
  ├── Find all AssetLinks where LinkState = 'pinned'
  │   └── Show badge: "Update available (v2.1)"
  │
  └── Detached links: no action
```

---

## 6. Conflict Resolution Rules

### 6.1 Write Conflicts

All assets are **single-writer** — the Shared Library is the authoritative source. Projects never push changes upstream automatically.

| Scenario | Resolution |
|----------|-----------|
| **Synced link + library updated** | Auto-overwrite project copy. No merge. Toast notification. |
| **Pinned link + library updated** | No change. Badge: "Update available (vX.Y)". User manually unpins to accept. |
| **Detached link** | Fully independent. No conflict possible. |
| **Re-attach detached asset** | User chooses: overwrite local with library version, or promote local as new library version. Never auto-merge. |
| **Two projects edit same detached copy** | No conflict — detached copies are project-local and independent. |

### 6.2 Version Conflicts

When promoting a local asset back to the library:

1. Compare local `ContentJson` hash with library's current `ContentJson` hash.
2. If **identical** → no-op, show "Already up to date".
3. If **different** → user chooses:
   - **Replace**: overwrites library version, bumps minor version.
   - **Fork**: creates a new library asset with a `-fork` slug suffix.
   - **Cancel**: aborts promotion.

### 6.3 Deletion Conflicts

| Action | Behavior |
|--------|----------|
| **Delete library asset** | All `synced` links become `detached` (preserving local copies). Toast: "Asset removed from library. N project copies preserved as local." |
| **Delete project from group** | Group membership removed. Local overrides preserved. No data loss. |
| **Delete project entirely** | All `AssetLink` rows for that project cascade-deleted. Library assets unaffected. |

### 6.4 Rules Summary

1. **No automatic merges** — always overwrite or fork, never 3-way merge.
2. **Library wins on sync** — synced links accept library version without question.
3. **User decides on re-attach** — explicit choice prevents silent data loss.
4. **Deletion preserves local** — removing a library asset never destroys project copies.

---

## 7. Storage Backend Design

### 7.1 Storage Layer

All cross-project sync data lives in the **extension's local SQLite database** (same DB used for sessions, prompts, and project metadata). No external server required.

### 7.2 Schema Additions

Tables from Section 4 are created via a migration in `src/lib/db-migrations.ts`:

```typescript
// Migration: cross-project-sync
const MIGRATION_CROSS_PROJECT_SYNC = `
  CREATE TABLE IF NOT EXISTS SharedAsset (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Type TEXT NOT NULL CHECK(Type IN ('prompt','script','chain','preset')),
    Name TEXT NOT NULL,
    Slug TEXT UNIQUE NOT NULL,
    ContentJson TEXT NOT NULL,
    ContentHash TEXT NOT NULL,           -- SHA-256 of ContentJson for diff detection
    Version TEXT NOT NULL DEFAULT '1.0.0',
    CreatedAt TEXT DEFAULT (datetime('now')),
    UpdatedAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS AssetLink (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    SharedAssetId INTEGER NOT NULL REFERENCES SharedAsset(Id) ON DELETE CASCADE,
    ProjectId INTEGER NOT NULL REFERENCES Project(Id) ON DELETE CASCADE,
    LinkState TEXT NOT NULL DEFAULT 'synced' CHECK(LinkState IN ('synced','pinned','detached')),
    PinnedVersion TEXT,
    LocalOverrideJson TEXT,
    SyncedAt TEXT DEFAULT (datetime('now')),
    UNIQUE(SharedAssetId, ProjectId)
  );

  CREATE TABLE IF NOT EXISTS ProjectGroup (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL,
    SharedSettingsJson TEXT,
    CreatedAt TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ProjectGroupMember (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    GroupId INTEGER NOT NULL REFERENCES ProjectGroup(Id) ON DELETE CASCADE,
    ProjectId INTEGER NOT NULL REFERENCES Project(Id) ON DELETE CASCADE,
    UNIQUE(GroupId, ProjectId)
  );

  CREATE INDEX IF NOT EXISTS idx_asset_link_project ON AssetLink(ProjectId);
  CREATE INDEX IF NOT EXISTS idx_asset_link_shared ON AssetLink(SharedAssetId);
  CREATE INDEX IF NOT EXISTS idx_group_member_project ON ProjectGroupMember(ProjectId);
`;
```

### 7.3 Content Hashing

Every `SharedAsset` stores a `ContentHash` (SHA-256 of `ContentJson`). Used for:
- Fast diff detection during promote-back (Section 6.2)
- Avoiding redundant overwrites on sync
- Computed on write via `crypto.subtle.digest('SHA-256', ...)`

### 7.4 Import/Export Format

Library export produces a single JSON file:

```json
{
  "exportVersion": "1.0",
  "exportedAt": "2026-04-07T12:00:00Z",
  "assets": [
    {
      "type": "prompt",
      "slug": "code-review",
      "name": "Code Review",
      "version": "2.1.0",
      "content": {}
    }
  ],
  "groups": [
    {
      "name": "Client X",
      "sharedSettings": {},
      "projectSlugs": ["proj-a", "proj-b"]
    }
  ]
}
```

Import merges by slug — existing slugs prompt the same Replace/Fork/Cancel dialog from Section 6.2.

---

## 8. Edge Cases & Error Handling

### 8.1 Data Integrity

| Edge Case | Handling |
|-----------|----------|
| **Corrupt ContentJson** | `JSON.parse` wrapped in try/catch. On failure: toast error, mark asset as `⚠️ corrupt` in UI, skip during sync. |
| **Missing SharedAsset for existing link** | `ON DELETE CASCADE` handles DB-level. If orphaned row found at runtime: log warning, auto-delete orphaned `AssetLink`. |
| **Duplicate slugs on import** | Slug collision triggers Replace/Fork/Cancel dialog. Never auto-overwrite on import. |
| **Empty library export** | Valid — produces `{ "assets": [], "groups": [] }`. Import of empty file is a no-op with toast: "Nothing to import." |

### 8.2 Performance

| Edge Case | Handling |
|-----------|----------|
| **Large library (500+ assets)** | Paginate Library view (50 per page). Sync engine processes in batches of 20 with `requestIdleCallback` between batches. |
| **Sync across 50+ projects** | Background sync runs sequentially per project to avoid SQLite write contention. Progress toast: "Syncing 12/50 projects..." |
| **Very large ContentJson (>1MB)** | Warn on save: "This asset is large and may slow sync." No hard limit — SQLite handles it. |

### 8.3 UI Edge Cases

| Edge Case | Handling |
|-----------|----------|
| **Last asset deleted from library** | Library tab shows empty state: "No shared assets yet. Promote one from a project to get started." |
| **Project removed from all groups** | Project continues to function independently. Its local asset copies remain. |
| **Promote asset with same slug as existing** | Dialog: "An asset with slug 'X' already exists. Replace or create 'X-2'?" |
| **Switch link from synced → pinned** | Immediate: freezes current version. No confirmation needed (reversible). |
| **Switch link from pinned → synced** | Confirmation: "This will overwrite your local copy with library v2.1. Continue?" |
| **Switch link from detached → synced** | Confirmation: "This will replace your local copy with the library version. Your local changes will be lost." |

### 8.4 Migration & Backward Compatibility

| Edge Case | Handling |
|-----------|----------|
| **Extension upgrade with no library tables** | Migration auto-creates tables on first DB open. No user action needed. |
| **Downgrade to version without sync** | Tables remain but are unused. No data loss. Re-upgrade restores access. |
| **Export from newer version, import to older** | `exportVersion` field checked. If unsupported: toast "This export requires extension vX.Y+". |

---

## 9. Files to Create

| File | Description |
|------|-------------|
| `src/pages/options/views/LibraryView.tsx` | Shared library browser |
| `src/components/library/AssetCard.tsx` | Library item card |
| `src/components/library/VersionHistory.tsx` | Version diff viewer |
| `src/components/library/SyncBadge.tsx` | Link state indicator |
| `src/components/library/PromoteDialog.tsx` | Replace/Fork/Cancel dialog for conflicts |
| `src/components/groups/ProjectGroupPanel.tsx` | Group management |
| `src/lib/sync-engine.ts` | Asset sync logic |
| `src/lib/version-manager.ts` | Semantic versioning helpers |
| `src/lib/content-hasher.ts` | SHA-256 content hash utility |
| `src/lib/library-import-export.ts` | JSON bundle import/export |

---

## 10. Acceptance Criteria

- [ ] Library tab shows all shared assets with version info
- [ ] Assets can be promoted from a project to the library
- [ ] Linked assets show sync/pinned/detached status
- [ ] Synced assets auto-update across projects on library edit
- [ ] Pinned assets show "update available" badge
- [ ] Detached assets are fully independent copies
- [ ] Project groups cascade shared settings
- [ ] Version history shows diffs between versions
- [ ] Import/export shared library as JSON bundle
- [ ] Conflict resolution dialogs work for Replace/Fork/Cancel
- [ ] Deleting a library asset preserves all project local copies
- [ ] Content hash prevents redundant overwrites
- [ ] Large library (500+ assets) paginates without lag
- [ ] Export version check prevents incompatible imports
