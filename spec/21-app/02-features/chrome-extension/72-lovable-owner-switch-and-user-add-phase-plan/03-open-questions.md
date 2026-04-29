# Open Questions — answer before / during the 20-phase plan

These are the ambiguities I noticed while splitting the work into 20 phases.
Please answer the ones marked **[BLOCKER]** before P1 starts. The others can
be answered when their phase begins.

## [BLOCKER] Q1 — Where does the shared module live?

The spec calls it `Lovable Common XPath` and mentions a possible second module
`lovable-common-api` for `LovableApiClient`. Two choices:

- **(a)** One project folder `standalone-scripts/lovable-common/` with two
  sub-modules (`xpath/`, `api/`) — cleaner, one info.json.
- **(b)** Two separate projects `lovable-common-xpath/` and
  `lovable-common-api/` — matches the verbatim wording but doubles the
  scaffolding.

Default if you don't answer: **(a)**.

## [BLOCKER] Q2 — Are the shared modules consumable via `RiseupAsiaMacroExt.require(...)`?

The dynamic script loading memory
(`mem://architecture/dynamic-script-loading`) says scripts can `require` other
scripts by namespace. Should `LovableOwnerSwitch` and `LovableUserAdd` import
the shared module via `await RiseupAsiaMacroExt.require("Lovable.CommonXPath")`,
or via a direct TypeScript import resolved at build time?

Default: **`require` at runtime** (matches existing pattern, supports hot
reload of XPath defaults).

## Q3 — Editor → Member normalization timing

User Add v2 says `Editor` is normalized to `Member` "at parse time". Confirm
the normalization should happen in the CSV parser (P13), not at the API call
site. Default: **yes, in the parser**.

## Q4 — Owner Switch: two OwnerEmail columns vs N

Spec lists `OwnerEmail1` + optional `OwnerEmail2`. Should the runner support
N owner emails per row (e.g. `OwnerEmail3`, `OwnerEmail4`) or strictly cap at
two? Default: **strictly two**, matching the schema.

## Q5 — Cache TTL for `Email → UserId` and `LoginEmail → WorkspaceId`

Root SDK `Cache.Add` accepts an optional TTL. What TTL should we use?

- WorkspaceId per LoginEmail — default **24h** (rarely changes).
- UserId per Email — default **24h** (rarely changes).

## Q6 — Sign-out failure handling

If sign-out fails (e.g. ProfileButton XPath stale), should the row's
`HasError` flag be set even if the main step succeeded, or should sign-out
errors be logged but not flip `HasError`?

Default: **log only, do not flip `HasError`**, because the business outcome
(promote / invite) already succeeded.

## Q7 — Incognito window reuse

Should each row open a fresh incognito window (clean state guaranteed) or
reuse one window across all rows in a task (faster, but cookies persist
between rows)? Default: **fresh incognito per row** — sign-out + close.

## Q8 — Owner Step B retry budget

Step B (`GET memberships` → `PUT role=Owner`) can fail if the new user hasn't
appeared in the membership list yet. The no-retry-policy
(`mem://constraints/no-retry-policy`) bans recursive retry. Should we:

- **(a)** Single attempt — fail fast, mark `HasError`, surface in logs.
- **(b)** Sequential poll with bounded budget (e.g. 3 attempts × 2s sleep)
  documented as an exception to the no-retry policy.

Default: **(a) single attempt**, consistent with the no-retry policy.

## Q9 — Version bump scope

P20 bumps the unified version. Minor or patch? Per
`mem://workflow/versioning-policy` and the user preference "Code changes must
bump at least minor version", default is **minor bump** (e.g. v2.146.0 →
v2.147.0).

## Q10 — Where do logs live on disk?

Per-project `logs/` folder is mentioned, but the actual storage layer
(`mem://architecture/data-storage-layers`) prefers SQLite + OPFS. Should
"per-task log file" mean:

- **(a)** A row group in the existing session logging SQLite table tagged by
  `TaskId`.
- **(b)** A real file in OPFS under `logs/{project}/{taskId}.log`.

Default: **(a) SQLite-tagged**, matches existing session logging system.

## Q11 — P17 sign-out deviation (resolved at P20)

**Context:** P17 (User Add per-row state machine) reinterpreted sign-out as
**task-level** (runs once at end of task) instead of per-row, because the User
Add CSV / popup design has no per-row login fields — every row uses the same
operator account.

**Resolution at P20 (2026-04-24):** **Confirmed task-level**. Rationale:
1. Owner Switch CSV has per-row `LoginEmail` + `Password` → per-row sign-out is
   correct for it (different operator per row → must clear cookies between).
2. User Add CSV has only `WorkspaceUrl` + `UserEmail` + `Role` → all rows run
   under the **same** operator account. Per-row sign-out would force re-login
   between every row, multiplying duration by ~Nx for no security/correctness
   gain.
3. The shared `LovableApiClient` carries the bearer token in memory; sign-out
   only matters at task boundaries because the operator is fixed for the
   duration of a task.
4. R12 invariant preserved either way — both projects' sign-out paths are
   independent of the single PUT call site.

**Locked in spec.** No code change needed at P20; the P17 implementation
(`run-task-sign-out.ts` stub + caller wires it once per task) is canonical.
