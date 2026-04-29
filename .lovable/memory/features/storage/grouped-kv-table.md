# Memory: features/storage/grouped-kv-table
Updated: 2026-03-22

The `GroupedKv` table (logs.db, Issue 60) provides a generic categorized key-value store with `GroupName + Key` as a unique composite. Message types: `GKV_GET`, `GKV_SET`, `GKV_DELETE`, `GKV_LIST`, `GKV_CLEAR_GROUP`. First consumer: `rename_forbidden` group caches workspace IDs that return 403 on rename. The macro controller loads this cache on init via `loadForbiddenRenameCache()`, skips cached workspaces during bulk rename, and auto-clears entries on successful force-retry.
