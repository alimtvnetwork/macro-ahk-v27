# Memory: architecture/auth-bridge-service
Updated: 2026-04-03

The Auth Bridge service (`src/auth-recovery.ts`) provides `getBearerToken(options?)` — the single TTL-aware entry point for all token consumers.

## Token Resolution Flow

1. **Fast path**: Read `marco_bearer_token` + `marco_token_saved_at` from localStorage. If age < TTL (configurable, default 2 minutes), return cached token immediately.
2. **Slow path**: If stale, missing, or `{ force: true }`, delegate to `authRecoveryManager.recoverOnce()` which runs a multi-tier waterfall (localStorage → extension bridge → cookie fallback) with single-flight concurrency control.

## Key APIs

| Function | Description |
|---|---|
| `getBearerToken(options?)` | TTL-aware async accessor. Returns cached if fresh, recovers if stale. `{ force: true }` bypasses TTL. |
| `getRawToken()` | Sync — returns localStorage token without TTL check. |
| `getTokenAge()` | Returns ms since last `saveTokenWithTimestamp()`. |
| `getTokenSavedAt()` | Raw timestamp from `marco_token_saved_at`. |
| `saveTokenWithTimestamp(token)` | Atomically writes token + timestamp to localStorage. |

## Configuration

TTL is resolved from (in priority order):
1. `window.marco_config_overrides.tokenTtlMs`
2. `window.__MARCO_CONFIG__.authBridge.tokenTtlMs`
3. Default: `120000` (2 minutes)

Config JSON key: `authBridge.tokenTtlMs` in `02-macro-controller-config.json`.
Type: `AuthBridgeConfig` in `src/types/config-types.ts`.

## Persistence

`persistResolvedBearerToken()` now calls `saveTokenWithTimestamp()` internally, ensuring every persisted token gets a timestamp for TTL checks.

All components (Credits, Workspace Loader, Macro Controller) call `getBearerToken()` — they never manage tokens directly.
