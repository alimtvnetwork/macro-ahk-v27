---
name: Installer deferred-delete behavioral simulation
description: PowerShell-driven simulation that synthesizes ERROR_SHARING_VIOLATION / ERROR_ACCESS_DENIED during install.ps1 cleanup and verifies rotation, MoveFileEx scheduling, marker fallback, scoped sweep, and no-throw guarantees — runs via system pwsh or `nix run nixpkgs#powershell`
type: feature
---

# Deferred-delete behavioral simulation (v2.226+)

Complements the static-analysis lint in `deferred-delete.test.sh` with
**real PowerShell execution** that reproduces the Windows lock failures
and verifies the production helpers behave correctly.

## Layout

| File | Purpose |
|------|---------|
| `tests/installer/fixtures/deferred-delete-simulation.ps1` | Pwsh fixture: 5 scenarios, TAP output |
| `tests/installer/deferred-delete-sim.test.sh` | Bash driver: locates pwsh (system or nix), runs fixture, parses TAP |
| `scripts/install.ps1` (line ~676) | Adds `MARCO_INSTALLER_TEST_MODE=1` guard so dot-sourcing doesn't run `Main` |

## Scenarios (29 assertions)

1. **Classifier** — `Test-IsSharingViolation` accepts canonical HResults
   (-2147024864 sharing-violation, -2147024891 access-denied), rejects
   unrelated IOExceptions (disk full), handles null safely.
2. **Rotation** — Mocked `Remove-Item` throws `ERROR_SHARING_VIOLATION`
   on the original path; verifies `Remove-PathSafely` does not throw,
   counters increment, leaf matches `^\..+\.delete-pending-marco-\d{14}-[0-9a-f]{6}$`,
   carries this run's RunId, original is renamed on disk, `Write-Note`
   fired (not `Write-Err`/`Write-Warn`).
3. **Marker fallback** — Verifies marker JSON has `Schema = marco-deferred-delete/v1`,
   `OwnerSignature = marco-installer`, current `RunId`, `Path`, `Reason`
   fields, and validates as ours via `Test-IsMarcoMarker`.
4. **Scoped sweep** — Plants foreign markers (no schema, wrong owner)
   and foreign artifacts (`*.old`, `random-delete-pending-*`) alongside
   our own RunId-stamped temp dir; verifies foreign files are NOT
   touched while ours IS swept; "unowned marker" notice is emitted.
5. **No-throw** — Both `Remove-Item` AND `Rename-Item` mocked to always
   throw `ERROR_ACCESS_DENIED`; verifies `Remove-PathSafely` still
   completes without raising, falling back to scheduling the original
   path for delayed delete.

## Bugs caught during development

- Strict mode contamination: `Set-StrictMode -Version Latest` in the
  fixture made `$entry.Schema` throw when the field was missing,
  causing the production `catch { Remove-Item $marker }` to delete
  foreign markers. Fix: don't enable strict mode in the fixture
  (production `install.ps1` doesn't set it either).
- Mock parameter conflict: `[CmdletBinding()]` auto-adds `-ErrorAction`
  as a common parameter; declaring `$ErrorAction` explicitly throws
  "defined multiple times". Fix: drop `[CmdletBinding()]` and use
  `ValueFromRemainingArguments` to swallow extras.

## Driver behavior

- Tries `pwsh` on PATH first, falls back to `nix run nixpkgs#powershell --`,
  prints SKIP and exits 0 if neither is available (static lint still
  covers contract surface).
- Parses TAP-ish `ok N - <desc>` / `not ok N - <desc>` from stdout.
- Wired into `npm run test:installer` (4th suite, after resolver +
  mock-server + deferred-delete static analysis).

## Totals

`npm run test:installer` now runs **167 assertions** across 4 suites:
46 (resolver) + 23 (mock-server) + 69 (deferred-delete static) + 29
(deferred-delete behavioral). Zero network in any suite.
