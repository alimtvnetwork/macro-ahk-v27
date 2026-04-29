# Macro Controller — `pro_0` Plan Credit Balance Retrieval

**Spec ID:** `spec/22-app-issues/110-macro-controller-pro-zero-credit-balance.md`
**Status:** Draft (awaiting `next` to implement)
**Owner:** Macro Controller
**Created:** 2026-04-27 (Asia/Kuala_Lumpur)
**Related memory:** `mem://features/macro-controller/pro-zero-credit-balance` (TO-DO)

---

## 1. Verbatim (source of truth)

> We need to make a change in the macro controller. There is a small part that has been changed. When we hit the workspace endpoint, we receive workspace info that contains a `plan` field, e.g. `pro_0`. If the workspace plan is `pro_0`, we cannot calculate the total credits available and used from the workspace endpoint alone. Instead, we have to make another endpoint request to the credit balance endpoint (named "credit balance"). That call returns a JSON response containing two new relevant fields: `total_granted` and `total_remaining`. `total_granted` represents the total available credits (the same total we currently calculate), and `total_remaining` represents the available credits. The logic is simple — not as complex as before — but it applies only when the plan is `pro_0`. For every other plan, leave the existing calculation as is.
>
> We should cache this info in IndexedDB short-term for at least 10 minutes (configurable from Settings) and async-save to our SQLite DB with a proper `Workspaces` table. When we right-click on these `pro_0` workspaces it should copy both workspace JSON + credit balance JSON.

---

## 2. STRICT rules

1. Credit balance call is made **only** when `WorkspacePlan === WorkspacePlan.PRO_ZERO`.
2. For every other plan, the existing calculation is unchanged.
3. `WorkspacePlan` is an `Enum`; raw string `"pro_0"` MUST NOT appear outside the Enum source-of-truth mapper.
4. Endpoint paths, header keys, and field names are constants — never magic strings.
5. Every fetch wrapped in `try/catch`; every failure logged via the existing `Logger`.
6. No swallowed errors — failed credit-balance call surfaces a typed error result.
7. `Authorization` token is read from secure storage; **redacted** in all logs.
8. Function ≤ 8 lines, file ≤ 100 lines, no nested `if`, no negative `if`.
9. No `any`, no `unknown`, no `interface {}` — every shape explicit. Generics allowed.
10. Definitions live in their own files (types, Enums, constants, fetch client) — never inline.

---

## 3. Mapping (single source of truth)

| `MacroCreditSummary` field | Source (only when `PRO_ZERO`)            |
|---------------------------|-------------------------------------------|
| `Total`                   | `CreditBalanceResponse.total_granted`     |
| `AvailableCredits`        | `CreditBalanceResponse.total_remaining`   |
| `TotalUsed`               | `CreditBalanceResponse.total_billing_period_used` |

For all other plans, the existing in-controller computation stays exactly as today.

---

## 4. Enums (each in its own file)

1. `WorkspacePlan` — `PRO_ZERO` (wire `"pro_0"`), `OTHER`.
2. `CreditGrantType` — `DAILY` (`"daily"`), `BILLING` (`"billing"`), `GRANTED` (`"granted"`).
3. `CreditBalanceFetchStatus` — `SUCCESS`, `HTTP_ERROR`, `NETWORK_ERROR`, `PARSE_ERROR`.
4. `CreditBalanceLogEvent` — `CREDIT_BALANCE_REQUESTED`, `CREDIT_BALANCE_RECEIVED`, `CREDIT_BALANCE_FAILED`, `CREDIT_BALANCE_SKIPPED_NON_PRO_ZERO`.
5. `MacroCreditSource` — `WORKSPACE_INFO`, `CREDIT_BALANCE`.

---

## 5. Endpoints

### 5.1 Workspaces endpoint
- **Path:** `/workspaces/{WorkspaceId}` (constant `WORKSPACES_ENDPOINT_TEMPLATE`)
- **Method:** `GET`
- **Auth:** `Authorization: Bearer <token>` from secure storage (redacted in logs)
- **Purpose:** read `plan` to decide whether the `PRO_ZERO` branch applies.

### 5.2 Credit balance endpoint
- **Path:** `/workspaces/{WorkspaceId}/credit-balance` (constant `CREDIT_BALANCE_ENDPOINT_TEMPLATE`)
- **Method:** `GET`
- **Auth:** same Bearer token mechanism (redacted in logs)
- **Called only when:** `WorkspacePlan === WorkspacePlan.PRO_ZERO`
- **Sensitive headers:** Authorization, cookies, session ids — redacted in logs.

---

## 6. TypeScript shapes (each in its own file)

```ts
// WorkspaceMembership
workspace_id: string;
user_id: string;
role: string;
email: string;
monthly_credit_limit: number | null;
invited_at: string;
joined_at: string;

// WorkspaceInfo (only fields we consume are required; rest optional)
id: string;
name: string;
plan: string;          // raw wire — mapped to WorkspacePlan via single mapper
plan_type: string;
credits_used: number;
credits_granted: number;
total_credits_used: number;
billing_period_credits_used: number;
billing_period_credits_limit: number;
billing_period_start_date: string;
billing_period_end_date: string;
membership: WorkspaceMembership;

// ExpiringGrant
grant_type: CreditGrantType;
credits: number;
expires_at: string;

// GrantTypeBalance
grant_type: CreditGrantType;
granted: number;
remaining: number;

// CreditBalanceResponse
ledger_enabled: boolean;
total_remaining: number;
total_granted: number;
daily_remaining: number;
daily_limit: number;
total_billing_period_used: number;
expiring_grants: ExpiringGrant[];
grant_type_balances: GrantTypeBalance[];

// MacroCreditSummary (controller output)
Total: number;
AvailableCredits: number;
TotalUsed: number;
Source: MacroCreditSource;

// CreditBalanceFetchResult — discriminated union
| { status: CreditBalanceFetchStatus.SUCCESS;       data: CreditBalanceResponse }
| { status: CreditBalanceFetchStatus.HTTP_ERROR;    httpStatus: number }
| { status: CreditBalanceFetchStatus.NETWORK_ERROR; reason: string }
| { status: CreditBalanceFetchStatus.PARSE_ERROR;   reason: string }
```

---

## 7. JSON samples

### 7.1 Workspaces response (only `plan: "pro_0"` triggers the new branch)

```json
{
  "id": "pFfe0ztWNNgEBZntv8Qx",
  "name": "loveable.engineer.v001's Lovable",
  "owner_id": "Mp2Vm09s7ndC5L6VMYskpiwH4Jo2",
  "plan": "pro_0",
  "plan_type": "monthly",
  "credits_used": 5,
  "credits_granted": 5,
  "billing_period_credits_used": 20,
  "billing_period_credits_limit": 20,
  "total_credits_used": 30.000000000000004,
  "billing_period_start_date": "2026-04-24T02:08:43Z",
  "billing_period_end_date": "2026-05-24T02:08:43Z",
  "membership": {
    "workspace_id": "pFfe0ztWNNgEBZntv8Qx",
    "user_id": "FP3OOftEhoZ8ebYFGQDXhsaG6Bd2",
    "role": "owner",
    "email": "alim.karim@riseup-asia.com",
    "monthly_credit_limit": null,
    "invited_at": "2026-04-26T10:27:28.096729Z",
    "joined_at": "2026-04-26T10:27:28.096729Z"
  }
}
```

### 7.2 Credit balance request (Authorization redacted in logs)

```text
GET https://api.lovable.dev/workspaces/{WorkspaceId}/credit-balance
accept: */*
authorization: Bearer <REDACTED>
content-type: application/json
```

### 7.3 Credit balance response

```json
{
  "$schema": "https://api.lovable.dev/GetWorkspaceCreditBalanceOutputBody.json",
  "ledger_enabled": true,
  "total_remaining": 165,
  "total_granted": 210,
  "daily_remaining": 5,
  "daily_limit": 5,
  "total_billing_period_used": 50,
  "expiring_grants": [
    { "grant_type": "billing", "credits": 155, "expires_at": "2026-06-24T08:00:00Z" },
    { "grant_type": "granted", "credits": 5,   "expires_at": "2027-04-22T12:46:04.405919144Z" }
  ],
  "grant_type_balances": [
    { "grant_type": "daily",   "granted": 5,   "remaining": 5 },
    { "grant_type": "billing", "granted": 200, "remaining": 155 },
    { "grant_type": "granted", "granted": 5,   "remaining": 5 }
  ]
}
```

---

## 8. Process diagram

```text
[Macro Controller invoked]
        │
        ▼
[GET /workspaces/{WorkspaceId}]
        │
        ▼
[Map workspace.plan → WorkspacePlan Enum]
        │
        ├─ WorkspacePlan.OTHER ──► existing calculation ──► MacroCreditSummary { Source: WORKSPACE_INFO }
        │
        └─ WorkspacePlan.PRO_ZERO
                  │
                  ├─ check IndexedDB cache (TTL ≥ 10 min, configurable)
                  │       └─ HIT  ──► return cached MacroCreditSummary
                  │
                  ▼
            [GET /workspaces/{WorkspaceId}/credit-balance]
                  │
                  ├─ SUCCESS ──► Total            = total_granted
                  │              AvailableCredits = total_remaining
                  │              TotalUsed        = total_billing_period_used
                  │              MacroCreditSummary { Source: CREDIT_BALANCE }
                  │              ─► write IndexedDB cache
                  │              ─► async upsert into SQLite Workspaces table
                  │
                  └─ HTTP_ERROR | NETWORK_ERROR | PARSE_ERROR
                              │
                              ▼
                        log CREDIT_BALANCE_FAILED + return typed error result
                        (no silent fallback)
```

---

## 9. Cache + persistence

1. **IndexedDB short-term cache** keyed by `WorkspaceId`, TTL **≥ 10 minutes**, configurable from Settings (`Settings.ProZeroCreditBalanceCacheTtlMinutes`, default `10`, min `1`, max `1440`).
2. **SQLite `Workspaces` table** — async upsert on every successful credit-balance fetch. Columns: `WorkspaceId TEXT PK`, `WorkspaceJson TEXT`, `CreditBalanceJson TEXT`, `Plan TEXT`, `FetchedAt TEXT (ISO-8601 UTC)`.
3. **Right-click → Copy** on a `pro_0` workspace row copies a single JSON payload `{ Workspace: <workspaceJson>, CreditBalance: <creditBalanceJson> }` to the clipboard.

---

## 10. Logging requirements

1. Use the existing `Logger` (`mem://standards/error-logging-via-namespace-logger`) — no new logger.
2. Events from `CreditBalanceLogEvent`:
   - `CREDIT_BALANCE_REQUESTED` — payload: `WorkspaceId`.
   - `CREDIT_BALANCE_RECEIVED` — payload: `total_granted`, `total_remaining`, `total_billing_period_used`.
   - `CREDIT_BALANCE_FAILED` — severity `ERROR`, payload: `CreditBalanceFetchStatus` + httpStatus or reason.
   - `CREDIT_BALANCE_SKIPPED_NON_PRO_ZERO` — payload: resolved `WorkspacePlan`.
3. `Authorization` header MUST be redacted before logging the request.
4. Error messages follow `mem://standards/error-message-format` (multi-line structured diagnostic).

---

## 11. Coding guidelines (must be respected)

1. Function ≤ 8 lines.
2. File ≤ 100 lines.
3. No nested `if`.
4. No negative `if` — invert and early-return.
5. Boolean names use `is` / `has` prefix; positive conditions only.
6. Strict types — no `any`, no `unknown`, no `interface {}`. Generics allowed.
7. No swallowed errors — every `catch` logged via the existing `Logger` (`mem://standards/no-error-swallowing`).
8. No magic strings or numbers — `Enum` first, constants second.
9. Definitions in their own files, not inline.
10. No type casting (`as T`, `as unknown as T`, `<T>x`) — `mem://standards/no-type-casting`.

---

## 12. Acceptance criteria

1. Spec file exists at this path containing verbatim, Enums, shapes, both endpoints, both JSON samples, mapping, diagram, cache rules, and AC.
2. TO-DO entry exists in Lovable memory referencing this spec path and title (`mem://features/macro-controller/pro-zero-credit-balance`) and is listed in `.lovable/plan.md` Pending — Next Up.
3. `WorkspacePlan` Enum exists in its own file; raw `"pro_0"` appears ONLY at the wire-to-Enum mapper.
4. When `WorkspacePlan === PRO_ZERO`, the controller fetches `/workspaces/{WorkspaceId}/credit-balance` exactly once per macro run (subject to IndexedDB TTL cache).
5. When the plan is anything other than `PRO_ZERO`, the credit-balance endpoint is NOT called and the existing calculation is unchanged.
6. On `PRO_ZERO` SUCCESS: `Total = total_granted`, `AvailableCredits = total_remaining`, `TotalUsed = total_billing_period_used`, `MacroCreditSummary.Source = CREDIT_BALANCE`.
7. On `PRO_ZERO` failure (HTTP / network / parse), `CREDIT_BALANCE_FAILED` is logged at ERROR with status/reason, and a typed error result is surfaced (no silent fallback).
8. `Authorization` header is redacted in every log line.
9. All new code follows: function ≤ 8 lines, file ≤ 100 lines, no nested `if`, no negative `if`, no `any` / `unknown` / `interface {}`, no casts, all definitions in their own files.
10. All Enums and constants are the single source of truth used by both production and tests.
11. IndexedDB cache TTL is read from `Settings.ProZeroCreditBalanceCacheTtlMinutes` (default 10).
12. SQLite `Workspaces` table is upserted asynchronously on every successful credit-balance fetch.
13. Right-click on a `pro_0` workspace copies `{ Workspace, CreditBalance }` JSON to the clipboard.

---

## 13. Resolved ambiguities (per user, 2026-04-27)

| # | Ambiguity | Resolution |
|---|---|---|
| 1 | Other plans (`pro_1`, …) requiring same path? | Restricted to `pro_0` only — confirm again before extending. |
| 2 | Prefer `total_billing_period_used` vs computed delta? | Use `total_billing_period_used` directly per verbatim mapping. |
| 3 | Cache strategy? | IndexedDB ≥ 10 min (Settings-configurable) + async SQLite upsert. |
| 4 | Failure → fallback to old calc, or hard fail? | **Hard-surface typed error** — no silent fallback. |
| 5 | `/spec` numbering? | `spec/22-app-issues/110-…` (next free number). |

## 14. Outstanding ambiguities (track during `next`)

- None at spec time. Reopen if implementation surfaces new questions.
