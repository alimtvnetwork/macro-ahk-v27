# Memory: features/macro-controller/token-fallback-auth
Updated: 2026-04-03

The Auth Bridge is a service that components call via `getBearerToken(options?)` to obtain a bearer token. It uses a TTL-cached localStorage strategy:

1. **localStorage (fast path)**: Read `marco_bearer_token` + `marco_token_saved_at`. If token exists and age < TTL (default 2min, configurable via `marco_config_overrides.tokenTtlMs` or `__MARCO_CONFIG__.authBridge.tokenTtlMs`), return immediately.
2. **Recovery (slow path)**: If stale, missing, or `{ force: true }`, delegate to `authRecoveryManager.recoverOnce()` — runs a multi-tier waterfall (localStorage scan → extension bridge GET_TOKEN → REFRESH_TOKEN → cookie fallback) with single-flight concurrency lock.

Additional methods: `getRawToken()` (returns localStorage token without TTL check), `getTokenAge()` (returns ms since last save), `getTokenSavedAt()` (raw timestamp).

All components (Credits, Workspace Loader, Macro Controller) call `getBearerToken()` — they never manage tokens directly. `persistResolvedBearerToken()` internally calls `saveTokenWithTimestamp()`, ensuring every persisted token gets a timestamp for TTL checks.
