# Chrome Extension Test Strategy

**Updated**: 2026-03-16

The Chrome Extension test suite follows a strict quality threshold requiring 100% passing tests and a minimum of 80% code coverage across core packages. As of v1.17.0, the suite consists of **822 unit and integration tests across 72 files**, utilizing Vitest for logic and Playwright for E2E verification.

## Recent Additions (v1.16.1 → v1.16.2)

Added dedicated test files for four previously untested background modules:

| Test File | Tests | Module |
|-----------|-------|--------|
| `tests/background/cookie-watcher.test.ts` | 5 | Cookie change listener & tab broadcasting |
| `tests/background/hot-reload.test.ts` | 7 | Build-meta polling & reload triggering |
| `tests/background/xpath-test-handler.test.ts` | 6 | XPath evaluation via executeScript |
| `tests/background/spa-reinject.test.ts` | 9 | SPA navigation detection & re-injection (P-009) |

**Total new tests**: 27 (795 → 822, 68 → 72 files)

## Coverage Areas

Comprehensive coverage ensures the reliability of:
- Background handlers (message routing, cookie resolution, hot reload)
- Injection pipelines (script management, content script lifecycle)
- SPA re-injection (marker probing, history state detection)
- Storage layer (SQLite logging, chrome.storage.local)
- User Script API (`marco.log.*`, `marco.store.*`)
- Import/Export (JSON, SQLite bundle, per-project DB)

## v1.17.0 Migration Notes

Background source files have moved from `chrome-extension/src/background/` to `src/background/`. Existing test imports using `@/background/...` still resolve through the re-export shims. No test files needed updating for the migration.

## Pending Test Coverage (v1.17.0+)

React UI components introduced in v1.17.0 do not yet have dedicated tests:
- `src/options/OptionsApp.tsx` — sidebar navigation, section routing, Framer Motion transitions
- `src/options/sections/ProjectsSection.tsx` — project CRUD, import/export
- `src/options/sections/ProjectEditor.tsx` — form state, save logic, editor sub-components
- `src/options/sections/DiagnosticsPanel.tsx` — auto-refresh, event log
- `src/options/sections/ScriptsLibrary.tsx` — script management
- `src/popup/PopupApp.tsx` — status cards, health ping, project selector

These should be added as part of the React UI unification (S-021).
