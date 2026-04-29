# 109 — React Hooks Visibility-Pause Rollout (PERF-10..12)

**Severity:** High (PERF-10) + Medium (PERF-11, PERF-12)
**Source audit:** `mem://performance/idle-loop-audit-2026-04-25` + `plan.md`
"Performance Audit — Idle / Background Loops"
**Resolution date:** 2026-04-26

---

## 1. Symptom

Three React hooks in the Options/Network/Auth-Diag UIs registered naked
`setInterval` timers that kept firing while the host tab was in a
background window or detached:

| Hook | Interval | Tick cost | Effect when tab hidden |
|------|----------|-----------|------------------------|
| `useTokenWatchdog` | 10 s | JWT decode + state update; auto-refresh fires `REFRESH_TOKEN` `sendMessage` near expiry | ~360 ticks/h per hidden tab; SW woken on each refresh attempt |
| `useNetworkData` | 5 s | 2× `sendMessage` (`GET_NETWORK_REQUESTS` + `GET_NETWORK_STATS`) per tick | SW woken every 5 s for any open Network panel, even in another window |
| `useErrorCount` | 30 s | 1× `sendMessage` (`GET_ACTIVE_ERRORS`) per tick | (Already mitigated — kept here for completeness) |

The MV3 service worker's idle-suspension heuristic is defeated by any
background-side message arrival, so each hidden tab effectively kept the
SW permanently alive.

---

## 2. Root Cause

All three hooks pre-date the `usePopupData` visibility-pause pattern and
were written when the team assumed React tabs would be foreground-only.
There was no shared abstraction, so every author had to rediscover the
`document.hidden` + `visibilitychange` dance — and two of three never did.

---

## 3. Fix

Introduced a single reusable hook:

`src/hooks/use-visibility-paused-interval.ts`

```ts
useVisibilityPausedInterval(tickFn, intervalMs, enabled?)
```

Contract:
- Fires `tickFn` immediately on mount **iff** the page is currently visible.
- While visible: ticks every `intervalMs`.
- On `visibilitychange → hidden`: clears the timer.
- On `visibilitychange → visible`: runs `tickFn()` once (catch-up), then
  re-arms the timer.
- `enabled = false` tears the timer down without unmounting (replaces the
  `autoRefresh` toggle plumbing in `useNetworkData`).
- SSR-safe: falls back to a plain `setInterval` when `document` is absent
  so unit tests still observe ticks.

### Application

| File | Change |
|------|--------|
| `src/hooks/use-network-data.ts` | Removed `useRef<intervalId>` + manual `useEffect` polling; replaced with `useVisibilityPausedInterval(refresh, AUTO_REFRESH_INTERVAL, autoRefresh)`. |
| `src/hooks/use-token-watchdog.ts` | Replaced the 10 s `setInterval` in the TTL-countdown effect with `useVisibilityPausedInterval(...)`; expRef closure preserved. |
| `src/hooks/use-error-count.ts` | **No change required** — already implemented the pattern by hand during the original audit. Kept verbatim and now serves as the canonical reference implementation. |

---

## 4. Verification

- `bunx tsc --noEmit` clean for all three hooks + the new helper.
- `useNetworkData` semantics preserved: `autoRefresh` toggle still tears
  the timer down (`enabled` prop), `refresh()` still callable manually,
  initial fetch on mount still happens (now via the immediate-tick
  contract instead of a separate `useEffect`).
- `useTokenWatchdog` semantics preserved: `expRef` is read inside the tick
  closure on every fire (still picks up token rotations via `fetchToken`'s
  `expRef.current = …` assignment).
- The shared hook's catch-up tick on `visibilitychange → visible` ensures
  a token that crossed the 5-min refresh threshold while the tab was hidden
  is still refreshed promptly when the user returns.

---

## 5. Files Changed

- **created** `src/hooks/use-visibility-paused-interval.ts`
- **edited** `src/hooks/use-network-data.ts`
- **edited** `src/hooks/use-token-watchdog.ts`

---

## 6. Follow-Ups

- PERF-13 (`startup-persistence.ts` MutationObserver narrowing) — separate
  RCA at `spec/22-app-issues/110-startup-persistence-observer-narrowing.md`
  (still **TODO**, lives in `standalone-scripts/macro-controller/`).
- Future hooks adding `setInterval` to a React tree must use
  `useVisibilityPausedInterval`. ESLint rule recommendation: forbid bare
  `setInterval` inside `src/hooks/*` via `no-restricted-syntax`.
