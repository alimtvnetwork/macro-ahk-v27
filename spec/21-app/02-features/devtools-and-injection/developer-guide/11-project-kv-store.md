# 11 — Project-Scoped IndexedDB Storage (`ProjectKvStore`)

> Generic, reusable key-value persistence for any plugin or script. Data is scoped per project and survives page reloads.

---

## Overview

The `ProjectKvStore` provides a shared IndexedDB-backed persistence layer that any script or plugin can use to store configuration, presets, or state data. Each project gets its own IndexedDB database, preventing collisions between projects.

**DB naming pattern**: `RiseUpAsia.Projects.<ProjectName>.IndexDb`

```
Script A (MacroController)
  → store.set("MacroController.Rename", "Default", presetObj)
  → IndexedDB: RiseUpAsia.Projects.my-project.IndexDb / kv / "MacroController.Rename::Default"

Script B (PromptManager)
  → store.set("PromptManager.Settings", "fontSize", 14)
  → IndexedDB: RiseUpAsia.Projects.my-project.IndexDb / kv / "PromptManager.Settings::fontSize"
```

Both scripts share the same IndexedDB database for the project, but use different **sections** to avoid key collisions.

---

## Import

```typescript
import { getProjectKvStore } from '../project-kv-store';
```

Source file: `standalone-scripts/macro-controller/src/project-kv-store.ts`

---

## API Reference

### `getProjectKvStore(projectName: string): ProjectKvStore`

Factory function. Returns a cached `ProjectKvStore` instance for the given project. The project name is sanitized (alphanumeric + hyphens + underscores, max 64 chars).

### `ProjectKvStore` Interface

| Method | Returns | Description |
|--------|---------|-------------|
| `get<T>(section, key)` | `Promise<T \| null>` | Read a single value |
| `set<T>(section, key, value)` | `Promise<void>` | Write a value (upsert) |
| `delete(section, key)` | `Promise<void>` | Remove a key |
| `list(section)` | `Promise<Array<{ key, value }>>` | List all entries in a section |
| `getAll(section)` | `Promise<Record<string, unknown>>` | Get all entries as a map |

### Parameters

- **`section`** — Logical grouping prefix (e.g. `"MacroController.Rename"`, `"PromptManager.Settings"`). Use your plugin name as prefix to avoid collisions.
- **`key`** — The specific setting name within the section (e.g. `"Default"`, `"fontSize"`).

### Internal Storage

Each record in IndexedDB has this shape:

```typescript
interface KvRecord {
  compoundKey: string;  // "${section}::${key}" — the keyPath
  section: string;      // For indexing / listing
  key: string;          // Original key
  value: unknown;       // Any serializable value
  updatedAt: number;    // Date.now() timestamp
}
```

---

## Usage Examples

### Example 1: Store and retrieve a simple value

```typescript
const store = getProjectKvStore('my-project-id');

// Write
await store.set('MyPlugin.Config', 'theme', 'dark');
await store.set('MyPlugin.Config', 'fontSize', 14);

// Read
const theme = await store.get<string>('MyPlugin.Config', 'theme');
// → "dark"

// List all in section
const all = await store.list('MyPlugin.Config');
// → [{ key: "theme", value: "dark" }, { key: "fontSize", value: 14 }]
```

### Example 2: Store a complex object (preset pattern)

```typescript
interface MyPreset {
  name: string;
  rules: string[];
  enabled: boolean;
}

const store = getProjectKvStore(projectId);

// Save a named preset
const preset: MyPreset = { name: 'Production', rules: ['no-console', 'strict'], enabled: true };
await store.set('MyPlugin.Presets', 'Production', preset);

// Load it back
const loaded = await store.get<MyPreset>('MyPlugin.Presets', 'Production');
```

### Example 3: Active selection pattern

A common pattern is storing which preset is currently active:

```typescript
const SECTION = 'MyPlugin.Presets';
const ACTIVE_KEY = '_active';

// Save active selection
await store.set(SECTION, ACTIVE_KEY, 'Production');

// On load, restore active
const activeName = await store.get<string>(SECTION, ACTIVE_KEY) || 'Default';
const activePreset = await store.get<MyPreset>(SECTION, activeName);
```

### Example 4: Delete and cleanup

```typescript
// Delete a single preset
await store.delete('MyPlugin.Presets', 'OldPreset');

// Get all as a map
const allPresets = await store.getAll('MyPlugin.Presets');
// → { "_active": "Production", "Production": {...}, "Default": {...} }
```

---

## Section Naming Convention

Use your plugin/script name as the section prefix to prevent collisions:

| Section | Owner | Purpose |
|---------|-------|---------|
| `MacroController.Rename` | Macro Controller | Rename presets |
| `MacroController.Settings` | Macro Controller | General settings |
| `PromptManager.Settings` | Prompt Manager | Prompt config |
| `AutoAttach.Config` | Auto-Attach | Attachment rules |
| `MyNewPlugin.Presets` | Your plugin | Your presets |

**Rule**: Always prefix with `<PluginName>.` — never use bare keys like `"fontSize"` at the section level.

---

## Error Handling

All methods catch IndexedDB errors internally and log with exact context:

```
[ProjectKvStore] get() failed — DB: "RiseUpAsia.Projects.abc123.IndexDb", section: "MyPlugin", key: "theme": DOMException: ...
```

On failure:
- `get()` returns `null`
- `list()` returns `[]`
- `set()` and `delete()` throw (caller should catch if needed)

---

## Reference Implementation: `RenamePresetStore`

The rename preset system (`rename-preset-store.ts`) is the canonical example of building a higher-level store on top of `ProjectKvStore`:

```typescript
import { getProjectKvStore } from './project-kv-store';

const SECTION = 'MacroController.Rename';

export function getRenamePresetStore(): RenamePresetStore {
  const kv = getProjectKvStore(resolveProjectKey());

  return {
    async listPresets() {
      const entries = await kv.list(SECTION);
      return entries
        .filter(e => e.key !== '_activePattern')
        .map(e => e.key);
    },
    async loadPreset(name) {
      return kv.get<RenamePreset>(SECTION, name);
    },
    async savePreset(name, preset) {
      preset.updatedAt = Date.now();
      await kv.set(SECTION, name, preset);
    },
    // ... more methods
  };
}
```

**Pattern to copy**:
1. Define your preset/config interface
2. Pick a unique section prefix
3. Wrap `ProjectKvStore` with typed methods
4. Use `_active` or `_activePattern` key for selection state
5. Export a factory function for your store

---

## Spec Reference

Full design specification: `spec/21-app/02-features/macro-controller/ts-migration-v2/07-rename-persistence-indexeddb.md`
