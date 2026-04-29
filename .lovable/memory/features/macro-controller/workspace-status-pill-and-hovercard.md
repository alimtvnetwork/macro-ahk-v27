---
name: workspace-status-pill-and-hovercard
description: Workspace lifecycle status pill (inline) and rich hover card on workspace-name with canceled-credit override pipeline
type: feature
---
# Workspace Status Pill + Hover Card (v2.224.0)

Final shape of `spec/22-app-issues/workspace-status-tooltip` — phases 1-6 all
shipped between v2.209.0 and v2.214.0. v2.215.0 added the always-on
"Subscription" section (status + status-changed-at + days-ago) to the hover
card and enriched the fallback `title=` PROFILE block to match. v2.224.0
added the always-on **"Estimated next refill"** + **"Warning starts on"**
rows to the Refill section.

## What it produces

Each row in the workspace dropdown shows:

```
[tier badge] [lifecycle pill?] WorkspaceName
```

Hovering the **name span** (`.loop-ws-name`) opens a positioned floating panel
with: header (name + pill), sub-header (Plan · Role · N projects · Git Sync),
Credits, **Subscription (status + Changed: DD MMM YY (Nd ago))**, **Refill
(Estimated next refill: DD MMM YY (in Nd) [from billing_period_end]?, plus
Warning starts on: DD MMM YY · −Nd (in Nd | active now))**, Expiry (when
applicable), Meta (Created, ID), **Thresholds (active)** showing the resolved
`expiryGracePeriodDays` and `refillWarningThresholdDays` (v2.219.0), and
**Status trace (debug)** — a priority-ladder view produced by
`explainEffectiveStatus()` in `status-explainer.ts` that lists every rule with
✓/✗ + skip reason and the inputs (subscription_status, tier,
status_changed_at, daysSinceChange, refill date, daysToRefill) that drove the
decision (v2.220.0).

The Refill section's **Estimated next refill** uses the same
`nextRefillAt → billingPeriodEndAt` waterfall the status engine uses; the
**Warning starts on** line is `estimateIso − cfg.refillWarningThresholdDays`
projected onto the calendar so the user sees exactly which day the
"About To Refill" pill will trigger. Tagged `(active now)` when the warning
window has already opened, omitted when threshold = 0.

Hovering the **row** still shows the legacy plain `title=` tooltip — now
enriched with a PROFILE block including `Subscription Status` and
`Status Changed` lines for parity.

## Status kinds (priority high → low)

`getEffectiveStatus(ws, cfg, nowMs?)` returns one of:

| Kind                | Trigger                                                   |
|---------------------|-----------------------------------------------------------|
| `fully-expired`     | canceled / expired AND `daysSinceChange >= grace`         |
| `expired-canceled`  | `subscription_status === canceled / cancelled`            |
| `expired`           | `tier === EXPIRED` (non-past_due, non-canceled)           |
| `about-to-expire`   | `subscription_status === past_due / unpaid`               |
| `about-to-refill`   | refill date within `refillWarningThresholdDays`           |
| `normal`            | none of the above                                         |

Past-due ∩ refill window → **about-to-expire wins** (resolved in priority order).

## Canceled credit override (single chokepoint)

Inside `parseLoopApiResponse → applyLifecycleOverrides()`, BEFORE
`aggregateCreditTotals`, every workspace where
`shouldApplyCanceledOverride(status) === true` is mutated:
- `rollover` → 0
- `billingAvailable` → 0
- `available` → `freeRemaining + dailyFree` (clamped ≥ 0)
- `totalCredits` → `freeGranted + dailyLimit + topupLimit`

Idempotent. Every downstream reader (status bar segments, row credit chips,
hover card, focus-current summary, CSV export, hot-reload reinject snapshot)
consumes post-override values.

Past-due workspaces are NOT overridden — they may still be paying.

## Config keys (`__MARCO_CONFIG__.creditStatus.lifecycle`)

| Key                            | Default | Type    |
|--------------------------------|---------|---------|
| `expiryGracePeriodDays`        | 30      | number  |
| `refillWarningThresholdDays`   | 7       | number  |
| `enableWorkspaceStatusLabels`  | true    | boolean |
| `enableWorkspaceHoverDetails`  | true    | boolean |

Constants live in `standalone-scripts/macro-controller/src/constants.ts` per
`mem://architecture/config-defaults-extraction` (no inline default objects).

## New WorkspaceCredit fields (Phase 1)

`numProjects, gitSyncEnabled, nextRefillAt, billingPeriodEndAt, createdAt,
membershipRole, planType` — all optional-safe (`?? 0` / `?? ''` / `?? false`)
and populated by `extractLifecycleMeta(readField)` in `credit-parser.ts`.

API field mapping: `num_projects`, `experimental_features.gitsync_github`,
`next_monthly_credit_grant_date`, `billing_period_end_date`, `created_at`,
`membership.role`, `plan_type`.

## Files

- `workspace-status.ts` — pure logic + date helpers (formatDateDDMMMYY, formatDayCount, daysBetween, daysUntil)
- `workspace-lifecycle-config.ts` — config resolver
- `status-explainer.ts` — `explainEffectiveStatus()` debug-trace mirror of the priority ladder (v2.220.0)
- `ws-hover-card.ts` — single-mount floating panel, viewport-aware positioning, Thresholds + Status-trace sections
- `ws-list-renderer.ts` — pill renderer + hover-card mounting + enriched fallback `title=`
- `credit-parser.ts` — `applyLifecycleOverrides()` chokepoint + `extractLifecycleMeta()`
- `__tests__/workspace-status.test.ts` — 20 priority + override unit tests
- `__tests__/workspace-status-transitions.test.ts` — 44 parameterized tests covering every status transition across multiple `expiryGracePeriodDays` (0, 7, 30, 60, 90, 365, 10000) and `refillWarningThresholdDays` (0, 1, 7, 14, 30, 365) values, including priority interactions and refill-source fallback (v2.221.0)
- `__tests__/status-explainer.test.ts` — 35 tests asserting the explainer stays in lockstep with `getEffectiveStatus`, exactly one rule matches per scenario, every skipped step carries a reason, and the inputs snapshot reports the correct active thresholds (v2.221.0)
- `__tests__/ws-hover-card.snapshot.test.ts` — 8 tests + 6 snapshots covering the Subscription section structure (status colour: active=#34d399, past_due=#fde68a, canceled=#fca5a5; Changed-line presence) and the full hover-card markup for active / past_due / canceled (v2.222.0)

## Edge cases (verified)

- Missing `next_monthly_credit_grant_date` → falls back to `billing_period_end_date` via `pickRefillIso()`
- Missing `experimental_features` → `gitSyncEnabled = false`
- `num_projects` 0 / missing → "Projects" line omitted in hover card and tooltip
- Canceled w/o `subscription_status_changed_at` → labelled "Expired (Canceled)" with no date suffix
- Past-due ∩ refill window → about-to-expire wins (priority order)
