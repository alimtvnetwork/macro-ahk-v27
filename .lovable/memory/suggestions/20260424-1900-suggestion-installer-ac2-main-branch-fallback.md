# Suggestion — Implement AC-2 (main-branch fallback) in installer

**Created:** 2026-04-24 19:00 (UTC+8)
**Status:** ✅ IMPLEMENTED — 2026-04-24 (sh side; ps1 still pending if needed)
**Audit source:** `plan.md` Pending #3 audit run on 2026-04-24

---

## Spec

`spec/14-update/01-generic-installer-behavior.md` §2 step 5 + §2.2 rule 2 + AC-2:

> | AC-2 | No flag, no URL hint, **zero releases** | Falls through to main branch, `🌿` banner |

The spec mandates that when the release host is reachable but reports zero releases, the installer **MUST** fall through to the main branch with a `🌿 Main branch (no releases found)` banner — **NOT** exit 5.

## Current behavior (gap)

Both installers exit 5 on empty releases:

- `scripts/install.sh` → `fetch_latest_version()` (L145-169): if `tag_name` is empty → `err … "Spec §2.3: discovery-mode API failure exits 5." → exit 5`. Conflates "API down" (correct exit 5) with "API up but zero releases" (should fall through).
- `scripts/install.ps1` → `Get-LatestVersion` (L121-133): catches **all** errors and exits 5.

## Why this matters

- Brand-new repos that ship `install.sh` from `main` before their first release are hard-blocked. Today the workaround is to publish a tagged-but-empty release.
- The spec is the contract other repos' installers (`quick-install`, `release-install`, `error-manage`) follow — drift here propagates.
- AC-2 is the only acceptance criterion in §9 with **zero** test coverage in the bundle.

## Proposed change (≤1 day)

1. Distinguish three outcomes in the API helper:
   - `tag` (non-empty) → return tag
   - HTTP 200 + `{}` body OR `[]` listing endpoint returns 0 releases → return sentinel `__MAIN_BRANCH__`
   - Network/5xx/timeout → exit 5 (unchanged)
2. `resolve_version` returns the sentinel; `download_asset` switches to a tarball fetch from `https://github.com/<repo>/archive/refs/heads/<MAIN_BRANCH>.tar.gz` (configurable, defaults to `main`).
3. Banner: `step "🌿 Discovery mode — main branch (no releases found)"` (mirrors §2.2 rule 3).
4. Add `MOCK_ZERO_RELEASES=1` mode to `tests/installer/fixtures/mock-server.cjs` — returns 200 with empty body for `/repos/.../releases/latest`.
5. Add `AC-2` block to `tests/installer/mock-server.test.sh` — asserts: rc=0, banner contains `🌿`, `VERSION` file contains commit SHA or `main`.

## Risk

- **Low** — additive resolver branch behind a clearly-named sentinel. Existing tests stay green.
- Spec §8 rule 4 ("MUST NOT execute arbitrary main-branch code unless discovery mode explicitly fell through and the user was told") is already satisfied by the banner.

## Why not done now

User has not yet approved a behavior change; this audit only added test coverage for already-implemented criteria. AC-2 needs a sign-off before installer code changes.

## Decision needed

- [ ] Approve AC-2 implementation as scoped above
- [ ] Reject — keep current "exit 5 on zero releases" and amend spec §2 step 5
- [ ] Defer with a target version
