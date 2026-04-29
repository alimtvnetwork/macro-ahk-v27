---
name: Installer deferred-delete
description: Windows reboot-safe self-replace cleanup for scripts/install.ps1 — RunId-stamped artifacts, canonical leaf-name patterns (marco-install-*, .delete-pending-*, gitmap-update-*, *.old.*), schema/owner-signature markers, and scoped sweepers that NEVER touch foreign files
type: feature
---

# Installer deferred-delete (v2.224.0+)

When `scripts/install.ps1` re-installs the extension and Chrome (or AV)
has files in the existing install dir locked, plain
`Remove-Item -Recurse -Force` raises `ERROR_SHARING_VIOLATION` /
`ACCESS_DENIED` and aborts the install. The deferred-delete machinery
makes re-installs **always succeed** by deferring cleanup of locked
artifacts to next reboot — and (v2.225+) **only ever touches files this
updater itself created**.

## RunId & canonical artifact identity

Every `Main` invocation generates a unique RunId at the top of the
script:

```powershell
$script:MarcoRunId          = "marco-$((Get-Date).ToString('yyyyMMddHHmmss'))-<6-hex>"
$script:MarcoMarkerSchema   = 'marco-deferred-delete/v1'
$script:MarcoOwnerSignature = 'marco-installer'
```

Every artifact this run creates embeds the RunId in its leaf name. The
sweep helpers use these stamps (plus the marker schema/owner) to tell
"ours" from "theirs" — random `.old` files, third-party `delete-pending-*`
dirs, and unowned markers in `pending-deletes/` are **never** touched.

### Canonical leaf patterns (the contract)

Stored as `$script:MarcoArtifactLeafPatterns` — kept in sync with the
test suite:

| Pattern                                                    | Created by                           |
|------------------------------------------------------------|--------------------------------------|
| `^marco-install-marco-\d{14}-[0-9a-f]{6}$`                 | `Get-Asset` (temp download dir)      |
| `^\..+\.delete-pending-marco-\d{14}-[0-9a-f]{6}$`          | `Remove-PathSafely` (rotated dir)    |
| `^gitmap-update-marco-\d{14}-[0-9a-f]{6}(?:-.+)?$`         | reserved (forward-compat)            |
| `^.+\.old\.marco-\d{14}-[0-9a-f]{6}$`                      | reserved (in-place backup, forward-compat) |

Anything not matching is foreign and left alone.

## Helpers

| Helper                          | Purpose                                                      |
|---------------------------------|--------------------------------------------------------------|
| `Test-IsMarcoArtifactLeaf`      | True iff a single leaf name matches one of the patterns      |
| `Test-IsMarcoArtifact`          | Convenience wrapper that takes a full path                   |
| `Test-IsMarcoMarker`            | True iff a parsed marker JSON has both schema + owner stamps |
| `Find-MarcoUpdaterArtifacts`    | Enumerates pattern-matching entries under `$env:TEMP` and `$env:LOCALAPPDATA\Marco` |
| `Find-MarcoArtifactsAt -dir`    | Enumerates pattern-matching entries under an arbitrary dir (used for the install-dir parent) |
| `Invoke-PendingDeleteSweep`     | Reads markers, validates schema/owner + path-leaf, then deletes |
| `Invoke-StaleArtifactSweep`     | Sweeps stranded rotated dirs from prior crashed runs         |

## The pipeline

`Remove-PathSafely -Path <p> -Reason <why>` runs:

1. **Try Remove-Item** — fast path; succeeds in 99% of cases.
2. **POSIX short-circuit** — on Linux/macOS, locked-file failure means
   real perms problem; surface a warning and return.
3. **Classify the failure** via `Test-IsSharingViolation` — sharing/lock
   errors get the informational treatment, other errors get a yellow
   warning but still proceed to fallback.
4. **Rename out of the way** — rename `<p>` to a sibling
   `.<leaf>.delete-pending-<runId>`. The original name is now free for
   the new install to atomically reuse.
5. **Schedule via MoveFileEx** with `MOVEFILE_DELAY_UNTIL_REBOOT` (0x4)
   and `lpNewFileName=$null`. Windows queues the deletion in
   `HKLM\System\CurrentControlSet\Control\Session Manager\PendingFileRenameOperations`
   and processes it on next boot.
6. **Marker-file fallback** — if MoveFileEx fails (no
   `SeRestorePrivilege`, exotic FS), write a JSON marker to
   `%LOCALAPPDATA%\Marco\pending-deletes\<rand>.txt` recording
   `{ Schema, OwnerSignature, RunId, Path, Reason, ScheduledAt, Pid }`.
7. **Sweep on startup** — `Invoke-PendingDeleteSweep` runs first thing
   in `Main`. **Strict ownership**: refuses to act on markers without
   the schema + owner stamps; refuses to delete recorded paths whose
   leaf doesn't match a canonical pattern. Foreign markers are reported
   as `Skipped N unowned marker(s)` and left in place.
8. **Stale-artifact sweep** — `Invoke-StaleArtifactSweep -installDir <d>`
   runs after the install dir is resolved. Finds canonical-pattern
   leftovers under `$env:TEMP`, `$env:LOCALAPPDATA\Marco`, and the
   install-dir's parent. Deletes if possible; defers via
   `Remove-PathSafely` if still locked.

## Logging tone (v2.225+)

Sharing/lock errors during cleanup are framed as **informational
notices** via `Write-Note` (DarkCyan), not warnings. The post-install
summary explicitly states `"Install completed successfully. N path(s)
had locked files; cleanup deferred."` plus `"No action needed — your new
install is live now."` Cleanup paths never call `exit` — the install's
exit code is unaffected by cleanup outcomes.

## P/Invoke surface

```powershell
Add-Type -Namespace 'Marco.Win32' -Name 'NativeMethods' -MemberDefinition @'
[DllImport("kernel32.dll", SetLastError=true, CharSet=Unicode)]
public static extern bool MoveFileEx(string lpExistingFileName, string lpNewFileName, uint dwFlags);
public const uint MOVEFILE_REPLACE_EXISTING   = 0x1;
public const uint MOVEFILE_COPY_ALLOWED       = 0x2;
public const uint MOVEFILE_DELAY_UNTIL_REBOOT = 0x4;
'@
```

Type cache guard (`'Marco.Win32.NativeMethods' -as [type]`) makes
`Add-Type` idempotent within a session.

## Callsite migration

Three places previously did bare `Remove-Item -Recurse -Force` and now
go through `Remove-PathSafely`:

| Location                              | Was                                    | Now                                                   |
|---------------------------------------|----------------------------------------|-------------------------------------------------------|
| `Install-Extension` (replace path)    | `Remove-Item $installDir -Recurse -Force` | `Remove-PathSafely -Path $installDir -Reason "replace previous install"` |
| `Get-Asset` failure path              | `Remove-Item $tmpDir -Recurse -Force`  | `Remove-PathSafely -Path $tmpDir -Reason "failed-download cleanup"` |
| `Main` `finally` (post-install)       | `Remove-Item $result.TmpDir -Recurse -Force` | `Remove-PathSafely -Path $result.TmpDir -Reason "post-install temp cleanup"` |

The static-analysis test suite asserts the bare-Remove-Item form is
**absent** from the file (regression guard) AND that no leaf-naming
regressed to `Get-Random`-suffixed names (foreign tools could collide).

## Tests

- `tests/installer/deferred-delete.test.sh` — **69 static-analysis
  assertions** covering: `Remove-PathSafely` surface, rename-then-replace
  pattern, MoveFileEx P/Invoke surface, marker fallback, cross-platform
  short-circuit, callsite migration (positive + negative), informational
  logging tone, sharing-violation classifier, "cleanup never exits"
  guarantee, and the v2.225+ scoped-artifact identification (RunId
  stamping, canonical pattern array, classifier helpers, sweep gating,
  foreign-marker skipping).
- Wired into `npm run test:installer` (alongside resolver +
  mock-server). Total: 46 + 23 + 69 = **138 assertions, zero network**.
- Deliberately not Pester-based: the sandbox lacks `pwsh` and full E2E
  needs a Windows kernel for real `MoveFileEx`. Treat this as a
  contract / lint test; run a Windows-runner E2E (TODO) for behavioral
  verification.

## What this does NOT do

- **Does not touch foreign files.** The whole point of v2.225+: if a
  third-party tool leaves a `foo.old` or `bar.delete-pending-XYZ` in
  `$env:TEMP`, we walk past it.
- **Does not retry deletion in a loop** within the same session (waste
  of time when Chrome is the holder — locks won't release until the
  user closes it).
- **Does not unload the Chrome extension or kill Chrome** — that's
  user-policy territory.
- **Does not run on POSIX** beyond the no-op short-circuit;
  POSIX deletes don't have the lock problem.

## Spec link

Cleanup behavior should be added to
`spec/14-update/01-generic-installer-behavior.md` §5 (TODO — the spec
currently doesn't address self-replace cleanup, the informational
framing, or the canonical artifact-naming contract; all three belong
there for downstream installers).
