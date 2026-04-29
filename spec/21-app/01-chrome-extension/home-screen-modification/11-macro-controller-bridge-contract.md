# 11 — MacroController Bridge Contract (Addendum)

**Version:** 1.0.0
**Updated:** 2026-04-23
**Status:** Production-Ready
**Supersedes:** Ambiguous "reuse macro-controller credit logic" wording in `07-pro-label-credit-append.md`

---

## Purpose

Lock in the **official, typed, content-script-safe** bridge surface between the
home-screen feature (`src/content-scripts/home-screen/`) and the macro-controller
runtime. Removes prior reliance on the undocumented `_internal.loopCreditState`
path.

---

## Authoritative Bridge Surface

All home-screen reuse of macro-controller state **MUST** go through the public
`api` namespace declared in
`standalone-scripts/macro-controller/src/api-namespace.ts`.

**No `_internal.*` access from outside macro-controller. No duplicate credit math.**

### Path

```
window.RiseupAsiaMacroExt.Projects.MacroController.api.credits
```

### Methods used by home-screen (`CreditsApi`)

| Method | Signature | Side-effect | Used by |
|---|---|---|---|
| `fetch` | `(isRetry?: boolean) => void` | Fire-and-forget refresh; updates the module-level `loopCreditState` singleton inside macro-controller. | `credit-source.ts → triggerRefresh()` |
| `getState` | `() => LoopCreditState \| null` | Pure read. Returns the current snapshot. `perWorkspace: WorkspaceCredit[]` is the keyed array consumed by `credit-append.ts`. | `credit-source.ts → readMap()` |

`LoopCreditState` and `WorkspaceCredit` are imported from
`standalone-scripts/macro-controller/src/types/credit-types.ts` — the single
source of truth for credit shapes.

---

## Consumer Contract

`src/content-scripts/home-screen/credit-source.ts`:

1. Resolve `api.credits` defensively — every hop optional-chained
   (`window.RiseupAsiaMacroExt?.Projects?.MacroController?.api?.credits`).
2. Call `fetch()` once per dictionary rebuild to trigger refresh.
3. Read state via `getState()`. Treat `null` and missing `perWorkspace`
   as "macro-controller not yet hydrated" → return an empty `CreditMap`.
   `workspace-dictionary.ts` then falls back to `0/0` for that workspace.
4. Wrap the whole load in `try/catch` → `RiseupAsiaMacroExt.Logger.error`
   (per `mem://standards/error-logging-via-namespace-logger.md`).

---

## Failure Modes (by design — no error)

| Condition | `getState()` returns | Home-screen behavior |
|---|---|---|
| MC SDK script not yet injected (e.g. user opens `/dashboard` before MAIN-world bootstrap completes) | `undefined` (api missing) | Empty credit map; pro labels show `0 / 0`. Next mutation-observer rebuild retries. |
| MC injected but `fetch()` has never resolved | `LoopCreditState` with `perWorkspace: []` | Empty credit map; identical fallback. |
| MC injected, fetch in flight | Stale `LoopCreditState` from previous fetch | Stale credits shown; refreshed on next rebuild. |

No retry loops. No exponential backoff. Per `mem://constraints/no-retry-policy`.

---

## Versioning

This bridge addition was shipped in extension `v2.225.0`:
- `CreditsApi.getState` added to the `api-namespace.ts` interface.
- `'api.credits.getState'` added to `NsPathMap`.
- `macro-looping.ts` wires `nsWrite('api.credits.getState', () => loopCreditState)`.

Any future consumer of macro-controller state from another content script
**MUST** follow this pattern: extend `*Api` interface → add `NsPathMap` entry →
wire via `nsWrite` in the appropriate bootstrap file → consume via the typed
`api.*` path with full optional-chaining.

---

## Related

- `spec/21-app/01-chrome-extension/home-screen-modification/07-pro-label-credit-append.md` — feature spec for credit append (this addendum overrides §"Reuse strategy").
- `mem://architecture/credit-monitoring-system` — retry-once-on-refresh policy (applies inside macro-controller, not at the bridge).
- `mem://architecture/message-relay-system` — 3-tier extension-to-page bridge architecture.
- `mem://constraints/no-retry-policy` — no recursive retry / backoff.
- `standalone-scripts/macro-controller/src/api-namespace.ts` — typed source of truth.
