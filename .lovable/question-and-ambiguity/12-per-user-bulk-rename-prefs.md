# 12 — Per-user storage for Batch Rename Sequence settings

## Request
> Store the last used Batch Rename Sequence settings per logged-in user
> (instead of globally in localStorage) so different users don't share defaults.

Currently persisted at `localStorage["marco.bulkRename.sequence.v1"]` —
shared by every user of the same Chrome profile.

## Blockers
- **No app-level auth.** Project is a Chrome extension; there is no
  username/email login flow to derive a stable user identity from.
- **No Supabase / no backend** (Core memory: "No Supabase").
  Per-user server-side persistence is forbidden.
- **`getBearerToken()` is for Lovable API calls**, not local-pref scoping.
  Using its claims as a partition key would couple UI prefs to
  auth-token shape and break on logout/refresh.
- **Chrome profiles already isolate localStorage** per OS user. Only
  uncovered case: multiple humans sharing one Chrome profile, which we
  cannot disambiguate without auth.

## Options

### A. Skip — recommend Chrome profile separation
- **Pros:** zero work; matches current security model (no-Supabase,
  no auth); profiles already give per-user isolation at the OS layer.
- **Cons:** users on one shared Chrome profile keep sharing defaults.
- **Risk:** none.

### B. Partition key = bearer-token sub claim
- **Pros:** approximates per-user without a backend.
- **Cons:** violates "Auth Contract" intent (single-path token use,
  not as a storage key); breaks on token refresh / logout / multi-account
  switch; no migration path; `getBearerToken()` may be unavailable when
  the popup opens before token readiness; couples a UI pref to auth.
- **Risk:** medium — silent data loss on token rotation.

### C. Workspace-scoped (use selected workspace as the partition)
- **Pros:** workspace switching already works; key is stable per-session.
- **Cons:** different *users* on the same workspace still share; the
  setting is about *user* preference, not workspace policy — wrong
  semantic axis.
- **Risk:** low, but doesn't solve the stated problem.

### D. Add a real auth layer
- **Pros:** would solve it correctly.
- **Cons:** out of scope; violates No-Supabase; multi-week feature;
  extension has no UX surface for sign-in.
- **Risk:** scope explosion.

## Recommendation
**A.** Do not implement. Document in the dialog (or in readme/CONTRIBUTING)
that defaults are per Chrome profile, and recommend separate Chrome
profiles when multiple humans share a machine. Revisit only if/when the
project grows a real user-identity layer.

## Decision
_Pending user confirmation. No code changes made._
