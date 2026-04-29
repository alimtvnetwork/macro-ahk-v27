---
name: Lovable scripts 20-phase implementation plan
description: Tasks 6+7+8 (Owner Switch, User Add v2, shared lovable-common-xpath + LovableApiClient) split into 20 sequential phases executed one-per-next; spec at 72-lovable-owner-switch-and-user-add-phase-plan/
type: feature
---

# Memory: features/lovable-scripts-20-phase-plan

Updated: 2026-04-24

## Status

📋 **Pending — execute one phase per explicit `next` command.**

## What was captured

User asked (2026-04-24) to split the three pending Lovable Chrome-extension
tasks (6 Owner Switch, 7 User Add v2, 8 shared modules) into 20 phases and
run one phase per `next`.

## Spec location

`spec/21-app/02-features/chrome-extension/72-lovable-owner-switch-and-user-add-phase-plan/`

- `01-overview.md` — phase table, execution rules, AC coverage map
- `02-progress-log.md` — append one line per completed phase
- `03-open-questions.md` — 10 questions (Q1, Q2 are blockers for P1)

## Plan tracking

`.lovable/plan.md` task #9 holds the 20-row breakdown (P1..P20). Each phase
flips its row to ✅ on completion. Tasks 6, 7, 8 stay in the table as
references but are subsumed by task 9's phased execution.

## Critical contracts (do not violate during phases)

- Step B Owner promotion in User Add MUST call the same
  `LovableApiClient.promoteToOwner(...)` used by Owner Switch — Review item
  R12 in `.lovable/plan.md`.
- Coding rules from `70-lovable-owner-switch/05-coding-rules-recap.md` apply
  to every phase (file ≤100 lines, fn ≤15 lines, no `!important`, no inline
  `<style>`, no `as` casts, no `unknown`, no magic strings, blank line before
  return, namespace logger on every catch).
- Auth via `mem://auth/unified-auth-contract` (`getBearerToken()`).
- No retry per `mem://constraints/no-retry-policy` (Q8 in open questions
  documents the single-attempt default for Step B).

## Open questions blocking P1

Q1 (shared module folder layout) and Q2 (require vs build-time import).
Defaults are documented in `03-open-questions.md` and will be applied if the
user does not answer before P1 starts.
