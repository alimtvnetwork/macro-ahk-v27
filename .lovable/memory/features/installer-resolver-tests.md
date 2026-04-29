---
name: Installer resolver test suite
description: Pure-bash test harness validating scripts/install.sh resolver behavior against spec/14-update/01-generic-installer-behavior.md
type: feature
---

# Installer resolver tests (v2.224.0)

Pure-bash test suite at `tests/installer/resolver.test.sh` that validates
`scripts/install.sh` against the Generic Installer Behavior specification
(`spec/14-update/01-generic-installer-behavior.md`). 30 assertions, no
external dependencies (no Bats), runs in any POSIX shell with bash.

## How it works

`scripts/install.sh` ends with a `MARCO_INSTALLER_TEST_MODE=1` guard that
skips the auto-run of `main()`. Tests source the installer in a subshell
and invoke `is_valid_version`, `version_from_url`, `resolve_version`, and
`parse_args` directly. `curl`/`wget` are shadowed via per-test PATH mocks
so the suite never hits the network.

## Coverage map (acceptance criteria from spec §8)

- AC-3 — URL-pinned strict mode (release-asset URL → strict)
- AC-4 — `--version vX.Y.Z` strict (no API call)
- AC-6 — invalid `--version` → exit 3
- AC-7 — `--version latest` → API lookup
- AC-8 — API unreachable + no `--version` → exit 5
- AC-9 — strict mode + API down → succeeds
- AC-12 — `--no-sibling-discovery` flag accepted
- AC-14 — `--dry-run --version` → exit 0, no install dir created
- Plus discovery-banner sanity, `--help` exit 0 + spec link

Not yet exercised (require sibling discovery to land in install.sh):
AC-10, AC-11, AC-13.

## Run

`npm run test:installer` (or `bash tests/installer/resolver.test.sh`).

## Production bug found while writing the suite

`fetch_latest_version` originally let `set -e` kill the script with rc=1
inside the `$(curl ... | grep ... | sed ...)` substitution before the
explicit `exit 5` guard could fire. Fixed by appending `|| true` to the
pipe and forcing `tag=""` initialisation so the spec §2.3 exit-5 path is
the single API-failure exit.

## Where to extend

When sibling-repo discovery (§4) lands, add AC-10 / AC-11 / AC-13 cases
that mock `Invoke-WebRequest`/`curl -I` HEAD responses and assert the
selected sibling.
