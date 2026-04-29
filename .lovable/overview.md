# Project Overview — Marco / Macro Controller Chrome Extension

**Owner:** Riseup Asia LLC
**Current version:** v2.166.0
**Stack:** Chrome Extension MV3 (TypeScript), Vite, sql.js (WASM), React 18 (preview UI only)
**Timezone (canonical):** Asia/Kuala_Lumpur (UTC+8)

## What it is

A Chromium-only browser-automation extension built for the Marco platform. Injects per-project user scripts into matched tabs via a hardened service-worker pipeline; persists per-project SQLite databases (logs, errors, project-scoped data) using OPFS → chrome.storage.local → in-memory fallback; exposes a frozen `window.marco` SDK plus a `RiseupAsiaMacroExt.Projects.<ProjectCodeName>.*` per-project namespace in the page's MAIN world.

## Top-level workspaces

| Path | Purpose |
|---|---|
| `chrome-extension/` | MV3 manifest + entry shims that re-export from `src/` |
| `src/background/` | Service-worker code: db-manager, message-router, handlers, injection pipeline |
| `src/background/handlers/` | Message-bus handlers (kv, gkv, files, project-api, logging, errors, …) |
| `standalone-scripts/marco-sdk/` | Frozen `window.marco` SDK + `Projects.RiseupMacroSdk` self-namespace |
| `standalone-scripts/macro-controller/` | Workspace UI controller injected into matched tabs |
| `standalone-scripts/xpath/` | XPath recorder/picker |
| `src/` (React) | Preview UI (popup + options) — dark-only theme |
| `spec/` | Numbered specifications, organised 00-standards … 17-app-issues |
| `.lovable/` | Memory, plan, suggestions, prompts, issues |

## Hard constraints

- **No Supabase**, anywhere. Storage = sql.js + OPFS + chrome.storage.local.
- **Dark-only theme** — no light mode, no toggle.
- **No retry / no exponential backoff** — sequential fail-fast only.
- **Read-only folders:** `skipped/`, `.release/`.
- **No CI notifications** — never email/notify on build events.
- **Zero ESLint warnings/errors** project-wide.
- **No `unknown`** outside `CaughtError`; defensive `?.` / `??` everywhere.
- **Unified versioning** — `manifest.json`, `src/shared/constants.ts`, every standalone-script `instruction.ts` and `shared-state.ts` must agree.

## Authoritative files

- Roadmap: `.lovable/plan.md`
- Suggestions: `.lovable/suggestions.md`
- Strict avoids: `.lovable/strictly-avoid.md`
- Memory index: `.lovable/memory/index.md`
- Onboarding for next AI: `.lovable/prompt.md`
