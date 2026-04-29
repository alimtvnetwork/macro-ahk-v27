# Phase-by-Phase Implementation Plan

> **Execution rule:** Do **not** start a phase until the user replies `next`.
> After each phase ships, append a short note here and update the Remaining Tasks section.

---

## Phase 1 — Config & Types Foundation

**Goal:** Land the data plumbing with zero behavior change.

1. Add `WorkspaceLifecycleConfigInput` to `standalone-scripts/macro-controller/src/config-types.ts`:
   - `expiryGracePeriodDays` (default `30`)
   - `refillWarningThresholdDays` (default `7`)
   - `enableWorkspaceStatusLabels` (default `true`)
   - `enableWorkspaceHoverDetails` (default `true`)
2. Extend default JSON config (the `__MARCO_CONFIG__` defaults file) with a new `creditStatus.lifecycle` block; named constants per `mem://architecture/config-defaults-extraction`.
3. Extend `WorkspaceCredit` in `types/credit-types.ts` with: `numProjects`, `gitSyncEnabled`, `nextRefillAt`, `billingPeriodEndAt`, `createdAt`, `membershipRole`, `planType`. All optional-safe (default `0` / `''` / `false`).
4. Populate the new fields in `parseLoopApiResponse` (defensive `?? 0` / `?? ''`).
5. `npx tsc --noEmit` must pass; no UI change yet.

**Done when:** types compile, config loads, fields appear in `loopCreditState.perWorkspace[*]`.

---

## Phase 2 — Status & Date Helpers (pure functions)

**Goal:** All decision logic, fully unit-testable, no DOM.

In `credit-parser.ts` (or new `workspace-status.ts`):

1. `daysBetween(isoA, nowMs)` — UTC day diff, floor.
2. `getEffectiveStatus(ws, cfg, nowMs)` → discriminated union:
   `{ kind: 'fully-expired' | 'expired' | 'canceled' | 'past-due' | 'about-to-refill' | 'normal', sinceIso?, refillIso?, daysToRefill? }`
3. `formatDateDDMMMYY(iso)` — `09 Apr 26` style.
4. `formatDaysAgo(n)` / `formatDaysIn(n)` — `3d`, `2mo 1d`.
5. `applyCanceledCreditOverride(ws)` — returns a shallow-cloned `WorkspaceCredit` with `available`, `billingAvailable`, `rollover`, `limit` adjusted; **only** when `getEffectiveStatus` returns `canceled` / `expired` / `fully-expired`.
6. Wire `applyCanceledCreditOverride` into the single chokepoint after `parseLoopApiResponse` so all consumers read post-override values.

**Done when:** Spec examples (Past-Due Pro / Active Pro) produce the expected label kind + correct numbers in a quick console check.

---

## Phase 3 — Inline Status Pill (UI)

**Goal:** Visible label beside workspace name in the workspace list row.

In `ws-list-renderer.ts`:

1. Read `getEffectiveStatus(ws, cfg, Date.now())`.
2. Render a small pill `<span class="marco-ws-status-pill marco-ws-status-{kind}">{label}</span>` immediately after the workspace name span.
3. Pill colors via existing semantic tokens (red-600 / red-500 / amber-500 / sky-400). No raw hex.
4. Respect `enableWorkspaceStatusLabels` toggle.
5. Keep the existing `·Nd` badge for now — it becomes redundant in Phase 4 and is removed there.

**Done when:** Past-Due → amber "About To Expire", Canceled → red "Expired (Canceled)", >30d canceled → "Fully Expired", refill-soon → sky "About To Refill".

---

## Phase 4 — Rich Hover Card on Workspace Name

**Goal:** Replace the plain `title=` on the workspace **name element** with a styled hover card; row tooltip text gets the same new lines.

1. Build `buildWorkspaceHoverHtml(ws, status, cfg)` returning an HTML string with sections from spec §5.
2. Mount a single shared `<div id="marco-ws-hovercard">` (lazy-created) positioned on `mouseenter` of the name element; hide on `mouseleave`. No external libs.
3. Update `buildLoopTooltipText` to include: Plan line, Projects, Refill (if any), Expiry (if any), Git Sync, Role.
4. Remove the now-redundant inline `·Nd` badge (subsumed by pill + tooltip).
5. Respect `enableWorkspaceHoverDetails` toggle (falls back to plain `title=`).

**Done when:** Hover on name shows the card; row hover still shows the (now richer) plain tooltip.

---

## Phase 5 — Credit Override Visual Verification

**Goal:** Confirm canceled workspaces show reduced available everywhere.

1. Audit every reader of `ws.available` / `ws.billingAvailable` / `ws.rollover`:
   - Status bar credit segments
   - Workspace row credit chips
   - Focus-current workspace summary
2. Verify all read post-override values (no double-application).
3. Add a console `Logger.debug` line summarizing the override per canceled workspace at parse time.

**Done when:** Canceled workspace in JSON shows `available = freeRemaining + dailyRemaining` only.

---

## Phase 6 — Edge Cases, Lint, Version, Docs

1. Edge cases:
   - missing `next_monthly_credit_grant_date` → fall back to `billing_period_end_date`
   - missing `experimental_features` → `gitSyncEnabled = false`
   - missing `num_projects` → omit Projects line (don't show `0`)
   - canceled with no `subscription_status_changed_at` → label `Expired (Canceled)`, no date suffix
   - past-due AND within refill window → About To Expire wins
2. `npx eslint . --max-warnings=0` and `npx tsc --noEmit` clean.
3. Bump version (manifest, constants, all standalone instruction/shared-state files) per `mem://workflow/versioning-policy`.
4. Add memory file `mem://features/macro-controller/workspace-status-pill-and-hovercard` summarizing final shape, fields, and config keys.
5. Update `mem://index.md` Memories list.

**Done when:** all examples from spec §8 pass manually; readme.txt milestone marker added per user preference.

---

## Remaining Tasks (live)

- [ ] **Phase 1** — Config & types foundation
- [ ] **Phase 2** — Status & date helpers (pure functions)
- [ ] **Phase 3** — Inline status pill UI
- [ ] **Phase 4** — Rich hover card on workspace name
- [ ] **Phase 5** — Credit override visual verification
- [ ] **Phase 6** — Edge cases, lint, version bump, memory + docs

> Reply **`next`** to begin **Phase 1**.
