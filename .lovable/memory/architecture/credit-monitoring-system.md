# Memory: architecture/credit-monitoring-system
Updated: 2026-04-03 (v2 — consolidated both paths)

Credit monitoring follows a **getBearerToken → fetch → retry-once-on-401** pattern.

## UI Flow (panel-controls.ts)

1. User clicks 💰 Credits button.
2. In-flight guard prevents duplicate clicks (`creditInFlight` flag).
3. Button enters loading state: `⏳ Loading…`, opacity 0.7, pointer-events none.
4. `getBearerToken()` called (TTL-aware — returns cached if fresh, recovers if stale).
5. On token ready → `fetchLoopCreditsWithDetect(false)` via SDK.
6. `pollUntil` waits for `loopCreditState.lastCheckedAt` to update (500ms interval, 15s timeout).
7. On complete → button restored, workspace list focused.

## API Flow (credit-fetch.ts)

### Callback path (`fetchLoopCredits`)
- Calls `apiFetchWorkspaces()` via `marco.api.credits.fetchWorkspaces()`.
- On 401/403 (first attempt only): `handleAuthRecovery()` → marks token expired → invalidates bridge key → `getBearerToken({ force: true })` → retries exactly once with `isRetry=true`.
- On retry failure: auth failure toast with diagnostic detail + copy button. No further retry.

### Async path (`fetchLoopCreditsAsync`)
- Uses `getBearerToken()` for initial token and `getBearerToken({ force: true })` on retry.
- Deduplication via `CreditAsyncState` singleton — concurrent calls share the same in-flight promise.
- On 401/403: `handleAsyncAuthFailure()` → `getBearerToken({ force: true })` → single retry via `fetchLoopCreditsAsync(true)`.

**Both paths use `getBearerToken({ force: true })` for recovery** — no direct `recoverAuthOnce()` or `delay()` calls remain in `credit-fetch.ts`.

## Removed
- `isTokenExpired()` helper in panel-controls.ts (replaced by `getBearerToken()` TTL logic).
- Manual `resolveToken()` + `recoverAuthOnce()` pre-flight chain (replaced by single `getBearerToken()` call).
- `recoverAuthOnce` and `delay` imports from credit-fetch.ts (no longer needed).
