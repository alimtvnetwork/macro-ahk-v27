---
name: SDK AuthTokenUtils
description: Pure token validation/extraction utilities moved from macro-controller auth-resolve.ts to marco-sdk as a static class
type: feature
---

## SDK AuthTokenUtils — Static Class

**Moved**: 2026-04-09
**From**: `standalone-scripts/macro-controller/src/auth-resolve.ts`
**To**: `standalone-scripts/marco-sdk/src/auth-token-utils.ts`
**Exposed on**: `window.marco.authUtils`

### Methods (all static)
- `normalizeBearerToken(raw)` — Strip "Bearer " prefix
- `isJwtToken(raw)` — JWT format check (eyJ + 3 parts)
- `isUsableToken(raw)` — Full validation (length, whitespace, JSON-like, JWT)
- `extractBearerTokenFromUnknown(raw)` — Extract from string/JSON with fallback

### Backward compatibility
auth-resolve.ts still exports `normalizeBearerToken`, `isJwtToken`, `isUsableToken`, `extractBearerTokenFromUnknown` as thin wrappers that delegate to `window.marco.authUtils.*` at runtime, with an inline fallback for early boot before SDK loads.

### Error policy
- NO swallowed errors — every catch block logs with context
- Nested ifs inverted to guard clauses with early returns
- JSON parse fallbacks log at debug level (intentional fallback behavior)

### What stays in controller (site-specific)
- FALLBACK_SESSION_COOKIE_NAMES (hardcoded fallback, not moved)
- getSessionCookieNames() (reads from config JSON)
- getBearerTokenFromSessionBridge() (uses SESSION_BRIDGE_KEYS)
- resolveToken(), persistResolvedBearerToken(), markBearerTokenExpired()
- updateAuthBadge() (DOM-dependent)
- TokenSourceState, CookieDiagnosticState singletons
