# Workspace Status, Expiry, Refill, Tooltip & Credit Override Spec

**ID**: `workspace-status-tooltip`
**Status**: 📋 Planning (no code yet — awaiting `next`)
**Severity**: High (UX clarity + credit math correctness)
**Date**: 2026-04-22 (Asia/Kuala_Lumpur)
**Target Version**: 2.209.0+
**Owner Files**:
- `standalone-scripts/macro-controller/src/ws-list-renderer.ts` (UI: name row, status pill, tooltip)
- `standalone-scripts/macro-controller/src/credit-parser.ts` (status helpers, expiry/refill formatters, override math)
- `standalone-scripts/macro-controller/src/types/credit-types.ts` (extra fields on `WorkspaceCredit`)
- `standalone-scripts/macro-controller/src/config-types.ts` + JSON config (new tunables)

---

## 1. Problem

The current workspace row shows the workspace name + a single `·Nd` "expired since" badge (added in v2.208.0). It does **not**:

1. Distinguish between **About To Expire** (`past_due`), **Expired** (`canceled`), and **Fully Expired** (passed grace period).
2. Show an **About To Refill** label when a healthy paid plan is near `next_monthly_credit_grant_date` / `billing_period_end_date`.
3. Provide a rich hover card with plan, projects, git-sync, role, refill ETA, etc.
4. Override the **total available credit** for canceled workspaces (rollover + billing should be excluded — they are lost on cancel).
5. Expose configurable thresholds for expiry grace and refill warning windows.

---

## 2. Status Decision Matrix (priority order, top wins)

| # | Condition | Main Label | Color | Tooltip section |
|---|-----------|------------|-------|-----------------|
| 1 | `subscription_status === 'canceled'` AND `daysSinceStatusChange >= expiryGracePeriodDays` | **Fully Expired** | red-600 | "Fully expired since DD MMM YY" |
| 2 | `subscription_status === 'canceled'` | **Expired (Canceled)** | red-500 | "Canceled on DD MMM YY" — no expiry countdown |
| 3 | `tier === 'EXPIRED'` AND `daysSinceStatusChange >= expiryGracePeriodDays` | **Fully Expired** | red-600 | "Fully expired since DD MMM YY" |
| 4 | `tier === 'EXPIRED'` (existing path) | **Expired** | red-500 | "Expired since DD MMM YY (Nd Xmo)" |
| 5 | `subscription_status === 'past_due'` | **About To Expire** | amber-500 | "Past due since DD MMM YY" |
| 6 | Refill date within `refillWarningThresholdDays` AND status not in {past_due, canceled, expired} | **About To Refill** | sky-400 | "Refills in N days (DD MMM YY)" |
| 7 | none of the above | (no pill) | — | normal plan summary |

**Rules:**
- Cancellation always wins over Past Due.
- Past Due always suppresses About To Refill.
- Fully Expired requires the grace window to have **fully elapsed** since `subscription_status_changed_at`.

---

## 3. Credit Override (second-layer)

For workspaces where `subscription_status === 'canceled'` OR effective label ∈ {Expired, Fully Expired}:

```
effectiveAvailable    = max(0, freeRemaining + dailyRemaining)   // free + daily only
effectiveTotalLimit   = freeGranted + dailyLimit
effectiveBillingAvail = 0
effectiveRollover     = 0
```

Active / trialing / past_due workspaces use the **existing** math unchanged.

The override is applied at a single chokepoint inside `credit-parser.ts` (proposed: new helper `applyCanceledCreditOverride(ws)`) so consumers (`ws-list-renderer`, status-bar, focus-current) all see the same numbers.

---

## 4. Refill Detection

Source preference (first non-empty wins):
1. `next_monthly_credit_grant_date`
2. `billing_period_end_date`

```
daysToRefill = ceil((refillDateMs - now) / 86_400_000)
isAboutToRefill = daysToRefill >= 0
                  && daysToRefill <= refillWarningThresholdDays
                  && status not in {past_due, canceled}
                  && tier !== 'EXPIRED'
```

---

## 5. Hover Card Contents

Single tooltip on the workspace **name** element (replaces the current plain `title=` string for that element only — row tooltip stays). Sections, in order, omitting any with no data:

1. **Header line** — `{name}` + status pill (Canceled / Expired / Fully Expired / About To Expire / About To Refill)
2. **Plan** — `pro_1 · monthly` (from `plan` + `plan_type`); show `(Canceled on DD MMM YY)` for canceled.
3. **Status timeline** — `Status: {subscription_status} · changed DD MMM YY`
4. **Projects** — `Projects: {num_projects}`
5. **Role** — `Role: {membership.role}`
6. **Credits** — same compact 4-line block currently used, but **post-override** values when canceled.
7. **Refill** — `Refills: DD MMM YY (in Nd)` when known.
8. **Expiry** — `Expired: DD MMM YY (Nd ago)` / `Fully expired: DD MMM YY` / `Past due since: DD MMM YY`.
9. **Git Sync** — `Git Sync: enabled` if `experimental_features.gitsync_github === true`, else `Git Sync: off`.
10. **Created** — `Created: DD MMM YY`.

**Date format everywhere:** `DD MMM YY` (e.g. `09 Apr 26`). No time component.

---

## 6. Configuration

Extend `[CreditStatus.Workspace]` (or new `[CreditStatus.Lifecycle]`) section in the controller JSON config:

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `expiryGracePeriodDays` | int | `30` | Days after `subscription_status_changed_at` before Expired escalates to Fully Expired. |
| `refillWarningThresholdDays` | int | `7` | Days before refill date to start showing About To Refill. |
| `enableWorkspaceStatusLabels` | bool | `true` | Master toggle for the inline status pill. |
| `enableWorkspaceHoverDetails` | bool | `true` | Master toggle for the rich hover card. |

Add to `config-types.ts` as `WorkspaceLifecycleConfigInput` and surface defaults via the existing config-defaults-extraction pattern (see `mem://architecture/config-defaults-extraction`).

---

## 7. JSON → Field Mapping

| JSON field | New `WorkspaceCredit` field | Used for |
|-----------|------------------------------|----------|
| `num_projects` | `numProjects: number` | tooltip Projects line |
| `experimental_features.gitsync_github` | `gitSyncEnabled: boolean` | tooltip Git Sync line |
| `next_monthly_credit_grant_date` | `nextRefillAt: string` | About To Refill |
| `billing_period_end_date` | `billingPeriodEndAt: string` | refill fallback |
| `created_at` | `createdAt: string` | tooltip Created line |
| `membership.role` | `membershipRole: string` | tooltip Role line |
| `plan_type` | `planType: string` | tooltip Plan line |
| `subscription_status_changed_at` | already on type | grace-period math |

All new fields are added to the existing `WorkspaceCredit` interface and populated in `parseLoopApiResponse` (no new types file).

---

## 8. Acceptance

- Past-Due Pro JSON example (Example 1) → label = **About To Expire (amber)**, tooltip shows `Past due since 16 Apr 26`, refill line **suppressed**.
- Active trialing Pro with refill 7 days out (Example 2 if `now` near `2026-05-03`) → label = **About To Refill**, tooltip shows `Refills 10 May 26 (in 7d)`.
- Canceled workspace 5 days ago → label = **Expired (Canceled)**, total available **excludes** rollover + billing.
- Canceled workspace 31 days ago (default grace) → label = **Fully Expired**.
- All dates render as `DD MMM YY`.
- Zero new ESLint warnings; project-wide `tsc --noEmit` green.

---

## 9. Out of Scope

- Server-side / API changes — pure client.
- Renaming or removing the existing `tier === 'EXPIRED'` path; new logic layers on top.
- Changing the row tooltip (`buildLoopTooltipText`) text shape — only the **name element** gets the new rich card; the row tooltip gains the same lines but stays plain text for now.

---

## 10. Related

- `spec/22-app-issues/credit-refresh/overview.md`
- `mem://architecture/credit-monitoring-system`
- `mem://architecture/config-defaults-extraction`
- v2.208.0 — initial expiry-since formatting (`formatExpiryStartDate`, `formatExpiredDuration`)
