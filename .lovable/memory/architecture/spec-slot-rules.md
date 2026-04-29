---
name: Spec slot rules (post 2026-04-22 update)
description: Foundations are 01-20 (strict); 21-app stays as wrapper; macro-controller promoted to top-level slot 26; chrome-extension renamed to 21-app/01-chrome-extension
type: constraint
---

## Slot allocation (authoritative as of 2026-04-22)

- **01–20: Foundations only.** Universal, project-agnostic specs. **No app-specific content** in this range. Vacant slots (currently 13, 15, 16, 18, 19, 20) are reserved for future foundations.
- **21+: App content.** App-specific specs.
  - `spec/21-app/` remains the **app wrapper** (NOT renamed).
  - Inside it, the chrome-extension feature is renamed `02-features/chrome-extension/` → `01-chrome-extension/` (promoted to primary feature within the wrapper). Other features (`devtools-and-injection`, `misc-features`) stay under `02-features/`.
- **22-app-issues/**: app issues / RCAs (unchanged).
- **26-macro-controller/**: NEW top-level slot. Macro-controller content is moved out of `21-app/02-features/macro-controller/` and promoted to its own top-level folder because of size and cross-cutting nature.
- **99-archive/**: historical content (unchanged).

## Why these rules

- Macro-controller is the largest spec set after chrome-extension (32 files, multiple subfolders) and is referenced by many other specs — top-level placement makes it discoverable.
- Chrome-extension stays inside `21-app/` because it's the app shell itself; promoting it to slot 21 directly was rejected to keep `21-app/` as a stable wrapper.
- Strict 01-20 foundations rule prevents app content from polluting universal slots.

## Migration impact

- Move: `spec/21-app/02-features/chrome-extension/` → `spec/21-app/01-chrome-extension/`
- Move: `spec/21-app/02-features/macro-controller/` → `spec/26-macro-controller/`
- Update: `.spec-folder-registry.json`, `00-overview.md`, `documentation-hierarchy.md` memory, all inbound references.
