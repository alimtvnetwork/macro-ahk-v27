# 01 — Overview: Home-Screen Modification

**Slot:** `spec/21-app/01-chrome-extension/home-screen-modification/`
**Status:** Active spec, ready for blind AI implementation
**Owner:** Riseup Asia Macro Extension
**Coding rules (mandatory, see file 10):** file ≤ 100 lines, function ≤ 8 lines, no negative `if`, no magic strings, enums first, every I/O wrapped in `try/catch` and logged via `RiseupAsiaMacroExt.Logger`.

## Purpose

Inject Chrome-extension UI on the Lovable home screen / dashboard to:

1. Auto-scroll the workspaces list to the currently-selected workspace.
2. Add a search bar that filters workspaces and clicks the top match on Enter.
3. Append `available / total` credits to each workspace's "Pro" label using existing macro-controller credit logic.
4. Add Up / Down / Step controls after the Lifetime Deal node to navigate workspaces.
5. Sync with macro controller on dashboard via `CurrentWorkspaceName`.

All execution is gated by a strict URL guard (file 02) and driven from a single `HomepageDashboardVariables` config (file 03), built into a one-pass workspace dictionary (file 04).

## Files in this spec

| File | Concern |
|------|---------|
| 01-overview.md | This file |
| 02-url-activation-guard.md | `AllowedHomeUrl` enum + exact-match guard |
| 03-homepage-dashboard-variables.md | XPath JSON config (full + relative) |
| 04-workspace-dictionary.md | One-pass scrape + dictionary contract |
| 05-search-bar.md | Search bar injection + filter + Enter behavior |
| 06-auto-focus-selected.md | `scrollIntoView` on selected item |
| 07-pro-label-credit-append.md | `available / total` append, reuses macro-controller |
| 08-up-down-step-controls.md | Up / Down / N-step controls after Lifetime Deal |
| 09-macro-controller-sync.md | `CurrentWorkspaceName` lookup on dashboard |
| 10-coding-guidelines-reference.md | Hard rules + lint references |

## Activation flow (summary)

```
[Page load] → [Read window.location.href]
   ├─ not in AllowedHomeUrl → EXIT silently
   └─ exact match → [One-pass scrape] → [Build dictionary]
        ├─ Inject search bar
        ├─ Inject Up/Down/Step
        ├─ Append credits to Pro label
        └─ scrollIntoView(selected)
             └─ if macro controller open → resolve via CurrentWorkspaceName
```

## Reuse contracts

- Credit logic: `standalone-scripts/macro-controller/` — `fetchLoopCredits` + `WorkspaceCredit` types (`standalone-scripts/macro-controller/src/types/credit-types.ts`). **Do not duplicate.**
- Logger: `RiseupAsiaMacroExt.Logger.error()` (per memory `error-logging-via-namespace-logger`).
- XPath resolve: `marco.xpath.resolve` / `resolveAll` (see `standalone-scripts/marco-sdk/src/xpath.ts`).

## Folder restructure (already applied)

Per memory `spec-slot-rules.md`, the chrome-extension spec is at `spec/21-app/01-chrome-extension/`. This feature is a subfolder of that spec.

## Screen isolation rule (STRICT)

`HomepageDashboardVariables` is **screen-scoped**. No keys may collide with any other screen's config object. Persisted to memory in `.lovable/memory/architecture/screen-scoped-variables-rule.md`.
