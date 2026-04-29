# 10 | Smart Workspace Switching, History & DevTools Stabilization | v7.9.35–v7.9.41

## Summary

This workflow covers cookie-based token recovery, free credit tracking refinement, project-scoped workspace history, smart depleted-workspace skipping, and DevTools injection stabilization.

## Changes Implemented

### v7.9.35: Cookie-based bearer token fallback
- `resolveToken()` unified chain: config.ini → localStorage → `lovable-session-id.id` cookie
- Auto-recovery on 401/403: checks cookie before marking expired
- All API call sites updated to use `resolveToken()`

### v7.9.36: 🍪 From Cookie button
- One-click UI button reads cookie, saves to localStorage, verifies via `/user/workspaces`, triggers full refresh
- Step-numbered logging for easy debugging

### v7.9.37: Free Credit tracking uses dailyFree only
- Loop trigger and `[Y]/[N] Free Credit` label now use `dailyFree` (daily_credits_limit − daily_credits_used)
- Move triggers when daily free credits hit 0, regardless of billing/rollover balance
- Double-confirm check also uses dailyFree

### v7.9.38: DevTools unified strategy (REVERTED in v7.9.41)
- Attempted: always F12 → ClickPageContent → Ctrl+Shift+J for all calls
- **Failed**: F12 on first call when DevTools was closed opened to wrong panel, causing DOMAIN GUARD ABORT

### v7.9.39: Project-scoped workspace history
- Project name displayed in MacroLoop controller title via `ProjectNameXPath`
- `getProjectIdFromUrl()` parses UUID from Lovable URL
- History stored per project: `ml_workspace_history_{projectId}` localStorage key
- `addWorkspaceChangeEntry()` called on every successful move

### v7.9.40: Smart workspace switching (skip depleted)
- `moveToAdjacentWorkspace()` fetches fresh data from `/user/workspaces` before every move
- Iterates in requested direction, finds first workspace with `dailyFree > 0`
- Skips all depleted workspaces; logs candidates checked and skipped count
- Fallback to immediate neighbor if no workspace has free credits
- Fallback to cached data (`moveToAdjacentWorkspaceCached()`) on fetch failure

### v7.9.41: DevTools two-branch restore
- Reverted v7.9.38 unified strategy
- First call: `ClickPageContent()` → `Ctrl+Shift+J` (avoids F12 to prevent wrong panel)
- Subsequent calls: `F12` (close) → `ClickPageContent()` → `Ctrl+Shift+J` (reopen on Console)
- Root cause: F12 on closed DevTools opens to last-used panel, not Console

## Architectural Implications
- **Token resilience**: Three-source fallback chain ensures automation survives session expiry
- **Smart switching**: Prevents wasted moves to depleted workspaces; critical for automated loop cycles
- **Project isolation**: History is project-scoped, preventing cross-project data contamination
- **DevTools stability**: Two-branch strategy is the proven reliable approach; unified approach is a known-bad pattern

## Lesson Learned
- v7.9.38→v7.9.41 cycle: "simplifying" a working two-branch strategy into a unified one introduced a regression. The two branches exist for a reason (F12 behavior differs on first vs subsequent calls). Do not unify them.

## Conclusion
v7.9.41 is a stable, feature-complete release with smart workspace management, resilient token handling, and battle-tested DevTools injection.
