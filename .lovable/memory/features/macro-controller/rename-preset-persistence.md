---
name: Rename Preset Persistence
description: Rename presets saved to project-scoped IndexedDB via generic ProjectKvStore, auto-save on Apply/Close
type: feature
---

## Rename Preset Persistence (Spec 07)

- Rename configurations stored in project-scoped IndexedDB: `RiseUpAsia.Projects.<ProjectName>.IndexDb`
- Generic `ProjectKvStore` (section::key pattern) reusable by any plugin
- `RenamePresetStore` wraps KV store for preset CRUD under section `MacroController.Rename`
- Multiple named presets with dropdown selector + New/Delete
- Auto-save on Apply, Close, and Cancel; auto-load on panel open
- Active preset name stored as `_activePattern` key
- localStorage `ml_rename_history` NOT migrated — only presets use IndexedDB
- Error logs must include exact DB name, store, key, and reason
- Spec: `spec/21-app/02-features/macro-controller/ts-migration-v2/07-rename-persistence-indexeddb.md`
