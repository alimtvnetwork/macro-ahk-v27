# Macro Controller — TypeScript Migration V2

**Created**: 2026-03-21
**Status**: ✅ Complete
**Active Codebase**: `standalone-scripts/macro-controller/src/`
**Current Version**: v2.126.0

---

## Overview

V2 migration focused on three pillars:

1. **Critical bug fixes** — initialization order, workspace name detection
2. **Architectural refactor** — class-based modules, removal of window globals, HTTP→SDK migration
3. **Performance & quality** — configurable logging, DOM caching, observer throttling, error logging, type safety

React migration was evaluated and deferred (Phase 03).

---

## Phases

| Phase | Spec File | Priority | Status |
|-------|-----------|----------|--------|
| 01 | `01-initialization-fix.md` | Critical | ✅ Complete |
| 02 | `02-class-architecture.md` | High | ✅ Complete |
| 03 | `03-react-feasibility.md` | Medium | ✅ Evaluated & deferred |
| 04 | `04-performance-logging.md` | High | ✅ Complete |
| 05 | `05-module-splitting.md` | Medium | ✅ Complete |
| 05a | `05a-json-config-pipeline.md` | Reference | ✅ Documentation of injection chain |
| 06 | `06-http-to-sdk-migration.md` | High | ✅ Complete (v1.74.0) |
| 07 | `07-rename-persistence-indexeddb.md` | Medium | ✅ Complete |
| 08 | `08-error-logging-and-type-safety.md` | High | ✅ Complete |

**All 8 phases complete.** No remaining migration work. See `99-consistency-report.md` for spec health audit.

---

## Current Architecture

```
index.ts
  └── macro-looping.ts (177 lines — thin orchestrator)
        ├── imports MacroController class + sub-modules
        ├── RiseupAsiaMacroExt namespace (no bare window globals)
        ├── UI via modular ui/*.ts DOM builders
        └── Startup: token gate → auth → credits → workspace detect
```

### Module Structure

| Category | Files | Responsibility |
|----------|-------|----------------|
| **Core** | `MacroController.ts`, `macro-looping.ts` | Entry point, class facade |
| **State** | `shared-state.ts`, `shared-state-runtime.ts` | Config, theme, mutable singletons |
| **Auth** | `auth.ts`, `auth-bridge.ts`, `auth-resolve.ts`, `auth-recovery.ts` | Token resolution, bridge, recovery |
| **Credits** | `credit-api.ts`, `credit-balance.ts`, `credit-fetch.ts` | Credit calc, bar, API calls via SDK |
| **Workspace** | `workspace-*.ts`, `ws-*.ts` | Detection, cache, rename, move, observer |
| **Rename** | `rename-*.ts`, `project-kv-store.ts` | Template engine, API, bulk ops, IndexedDB presets |
| **Startup** | `startup*.ts` | Ordered boot sequence, token gate, toast |
| **Logging** | `logging.ts`, `log-manager.ts`, `error-utils.ts` | Batched logs, configurable levels, structured errors |
| **UI** | `ui/*.ts` (25+ files) | Panel, menus, settings, database modal, prompts |
| **Types** | `types/*.ts` (12 files) | Configs, credits, workspaces, UI, enums |
| **Infra** | `constants.ts`, `globals.d.ts`, `controller-registry.ts` | Shared constants, Window types, late-binding |

---

## Dependencies

- Spec `10-macro-controller/js-to-ts-migration/` — V1 migration (completed Steps 1-5b)
- Spec `11-chrome-extension/50-script-dependency-system.md` — Script injection order
- SDK `standalone-scripts/marco-sdk/` — API registry, auth utils, logger

---

## Rules

1. **No breaking changes** — existing AHK/extension consumers must keep working
2. **One phase at a time** — verify each phase before starting next
3. **Backward compat** — window globals retained as thin facades until all consumers migrate
4. **Bug fixes first** — Phase 01 must land before any refactor work
5. **Discuss before implementing** — per Engineering Standard #9

---

*Migration complete — 2026-04-09*
