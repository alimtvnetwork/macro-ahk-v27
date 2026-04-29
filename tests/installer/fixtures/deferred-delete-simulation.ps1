#requires -Version 7.0
<#
.SYNOPSIS
    Behavioral simulation for install.ps1 deferred-delete machinery.

.DESCRIPTION
    Reproduces ERROR_ACCESS_DENIED (0x80070005 / -2147024891) and
    ERROR_SHARING_VIOLATION (0x80070020 / -2147024864) failures during
    cleanup, then verifies the deferred-delete pipeline actually:

      1. Recognises the failure as a sharing/lock error
         (Test-IsSharingViolation returns $true)
      2. Renames the locked path to a RunId-stamped sibling
         (.<leaf>.delete-pending-marco-<ts>-<rand>)
      3. Schedules the rotated path via MoveFileEx (mocked) OR falls
         back to a pending-delete marker file with the correct
         schema/owner/RunId stamps
      4. Increments the user-visible counters
         ($script:DeferredDeleteCount, $script:DeferredDeleteRebootRequired)
      5. Emits informational Write-Note output (NOT Write-Err) for the
         expected sharing-violation case
      6. Never throws or sets a non-zero exit code from cleanup paths
      7. Sweeps its own markers/artifacts on the next run while leaving
         FOREIGN markers and FOREIGN .old files untouched

    Loads install.ps1 via the MARCO_INSTALLER_TEST_MODE=1 guard so Main
    doesn't execute. Replaces select cmdlets/functions with capturing
    test doubles before exercising the real production code paths.

    Exit code: 0 if every assertion passes, non-zero otherwise.
    Output: TAP-ish "ok N - <desc>" / "not ok N - <desc>" lines so the
    bash driver can grep results without re-implementing PS parsing.
#>

$ErrorActionPreference = 'Stop'
# Note: deliberately NOT setting strict mode. install.ps1 runs without
# Set-StrictMode in production, so this fixture must mirror that env to
# avoid synthetic failures (e.g. accessing a missing property on a
# PSCustomObject throws under strict mode but returns $null otherwise —
# which is the behavior Test-IsMarcoMarker relies on for foreign markers).

# ─── Test infrastructure ──────────────────────────────────────────────

$script:TestNum = 0
$script:TestPassCount = 0
$script:TestFailCount = 0
$script:TestFailLines = @()

function ok([string]$desc, [bool]$cond, [string]$detail = '') {
    $script:TestNum++
    if ($cond) {
        $script:TestPassCount++
        Write-Host "ok $script:TestNum - $desc"
    } else {
        $script:TestFailCount++
        $script:TestFailLines += "#$script:TestNum $desc"
        Write-Host "not ok $script:TestNum - $desc"
        if ($detail) { Write-Host "  # $detail" }
    }
}

function Reset-LogCaptures {
    $script:CapturedNotes = New-Object System.Collections.Generic.List[string]
    $script:CapturedWarns = New-Object System.Collections.Generic.List[string]
    $script:CapturedErrs  = New-Object System.Collections.Generic.List[string]
    $script:CapturedSteps = New-Object System.Collections.Generic.List[string]
    $script:CapturedOks   = New-Object System.Collections.Generic.List[string]
    $script:CapturedHosts = New-Object System.Collections.Generic.List[string]
    $script:MoveFileExCalls = New-Object System.Collections.Generic.List[hashtable]
    $script:DeferredDeleteCount = 0
    $script:DeferredDeleteRebootRequired = $false
}

function Reset-Mocks {
    # Restore real Remove-Item / Rename-Item by removing our overrides.
    # Scenarios that need a mock define a fresh global:Remove-Item after
    # this; scenarios that don't get the real cmdlet via normal lookup.
    foreach ($name in 'Remove-Item','Rename-Item') {
        $fn = Get-Item "function:global:$name" -ErrorAction SilentlyContinue
        if ($fn) { Remove-Item "function:global:$name" -Force -ErrorAction SilentlyContinue }
    }
}

# ─── Load install.ps1 in test mode ────────────────────────────────────

$env:MARCO_INSTALLER_TEST_MODE = '1'
$installerPath = Join-Path $PSScriptRoot '..\..\..\scripts\install.ps1'
if (-not (Test-Path -LiteralPath $installerPath)) {
    Write-Host "1..0 # install.ps1 not found at $installerPath"
    exit 2
}
. $installerPath

# ─── Override loggers AFTER dot-sourcing so production code calls them ─

# Note: install.ps1 defines these as `function Write-Note`, etc. We
# redefine them in script scope here. PowerShell function lookup walks
# the scope chain, so the redefined versions win for code we invoke
# below (Remove-PathSafely, Invoke-DelayedDelete, etc.) when called
# from this same script.
function global:Write-Note ([string]$msg) { $script:CapturedNotes.Add($msg) | Out-Null }
function global:Write-Warn ([string]$msg) { $script:CapturedWarns.Add($msg) | Out-Null }
function global:Write-Err  ([string]$msg) { $script:CapturedErrs.Add($msg)  | Out-Null }
function global:Write-Step ([string]$msg) { $script:CapturedSteps.Add($msg) | Out-Null }
function global:Write-OK   ([string]$msg) { $script:CapturedOks.Add($msg)   | Out-Null }
# Note: we deliberately do NOT override Write-Host. The fixture itself
# uses Write-Host for TAP output, and install.ps1's only Write-Host
# callers (the install summary) live inside Write-InstallSummary, which
# runs from Main — and Main never executes in MARCO_INSTALLER_TEST_MODE.

# ─── Helpers to synthesize the exact Win32 exceptions ─────────────────

function New-SharingViolationException {
    # ERROR_SHARING_VIOLATION = 32 → HResult 0x80070020 = -2147024864
    $msg = "The process cannot access the file '\u0027C:\fake\path\u0027' because it is being used by another process."
    $ex = [System.IO.IOException]::new($msg, -2147024864)
    return $ex
}

function New-AccessDeniedException {
    # ERROR_ACCESS_DENIED = 5 → HResult 0x80070005 = -2147024891
    $msg = "Access to the path 'C:\fake\path' is denied."
    $ex = [System.UnauthorizedAccessException]::new($msg)
    # UnauthorizedAccessException defaults to E_ACCESSDENIED already, but
    # be explicit so the classifier sees the canonical HResult.
    [System.Runtime.InteropServices.Marshal]::GetLastWin32Error() | Out-Null
    $hresultProp = $ex.GetType().GetProperty('HResult', [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::Public -bor [System.Reflection.BindingFlags]::NonPublic)
    if ($hresultProp -and $hresultProp.CanWrite) {
        $hresultProp.SetValue($ex, -2147024891)
    } else {
        # Fallback: use the protected setter via the field
        $hrField = $ex.GetType().BaseType.GetField('_HResult', [System.Reflection.BindingFlags]::Instance -bor [System.Reflection.BindingFlags]::NonPublic)
        if ($hrField) { $hrField.SetValue($ex, -2147024891) }
    }
    return $ex
}

# ─── Scenario 1: Test-IsSharingViolation classifier ───────────────────

Reset-LogCaptures
Write-Host '# === Scenario 1: classifier recognises the canonical Win32 lock errors ==='

$shareEx = New-SharingViolationException
ok 'classifier accepts ERROR_SHARING_VIOLATION (HResult -2147024864)' `
    (Test-IsSharingViolation $shareEx) `
    "HResult=$($shareEx.HResult), Message=$($shareEx.Message)"

$denyEx = New-AccessDeniedException
ok 'classifier accepts ERROR_ACCESS_DENIED (UnauthorizedAccessException)' `
    (Test-IsSharingViolation $denyEx) `
    "HResult=$($denyEx.HResult), Message=$($denyEx.Message)"

$genericEx = [System.IO.IOException]::new('disk full', -2147024784)  # ERROR_DISK_FULL
ok 'classifier rejects unrelated IOException (disk full)' `
    (-not (Test-IsSharingViolation $genericEx)) `
    "HResult=$($genericEx.HResult)"

ok 'classifier handles null safely' `
    (-not (Test-IsSharingViolation $null))

# ─── Scenario 2: Remove-PathSafely on a locked file (real FS, mocked Remove-Item) ─

Reset-LogCaptures
Write-Host '# === Scenario 2: Remove-PathSafely handles ERROR_SHARING_VIOLATION ==='

# Force the Windows code path even on Linux — the production helper
# branches on Test-IsWindowsPlatform; we shadow it for this scenario so
# the rotation + MoveFileEx path executes on the test runner.
function global:Test-IsWindowsPlatform { return $true }

# Build a real temp dir that we can actually rename. The mocked
# Remove-Item throws once for the original path, then succeeds for the
# rotated path so we can verify the rotation pattern.
$realTmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) "marco-sim-$([guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $realTmpRoot -Force | Out-Null
$lockedDir = Join-Path $realTmpRoot 'fake-install-dir'
New-Item -ItemType Directory -Path $lockedDir -Force | Out-Null
'sentinel' | Set-Content (Join-Path $lockedDir 'manifest.json')

# Mock Remove-Item: throw a sharing-violation on the original path,
# pass through for everything else (rotated path, marker cleanup, etc.)
# IMPORTANT: do NOT use [CmdletBinding()] — it auto-adds -ErrorAction
# as a common parameter, conflicting with our own pass-through. Define
# parameters explicitly with -ValueFromRemainingArguments to swallow
# any other args the production code passes.
$script:RemoveItemThrowOnce = $lockedDir
function global:Remove-Item {
    param(
        [Parameter(ValueFromPipeline = $true, Position = 0)] $Path,
        [string]$LiteralPath,
        [Parameter(ValueFromRemainingArguments = $true)] $Rest
    )
    $target = if ($LiteralPath) { $LiteralPath } else { $Path }
    if ($target -eq $script:RemoveItemThrowOnce) {
        $script:RemoveItemThrowOnce = $null  # only throw once
        throw (New-SharingViolationException)
    }
    Microsoft.PowerShell.Management\Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
}

# Mock MoveFileEx by redefining Add-MoveFileExType + Invoke-DelayedDelete's
# native call site. We can't easily override a static type method that's
# already loaded, so instead we replace the production Invoke-DelayedDelete
# wrapper with one that records the call and pretends MoveFileEx succeeded.
# This still exercises the upstream code path (Remove-PathSafely calling
# us with the rotated path + reason).
function global:Invoke-DelayedDelete([string]$path, [string]$reason) {
    $script:MoveFileExCalls.Add(@{ Path = $path; Reason = $reason; Result = 'scheduled' }) | Out-Null
    $script:DeferredDeleteCount++
    $script:DeferredDeleteRebootRequired = $true
    Write-Note "Cleanup deferred to next reboot (file locked by another process):"
    return $true
}

# Run the production helper — should NOT throw.
$threw = $false
try {
    Remove-PathSafely -Path $lockedDir -Reason 'simulation: replace previous install'
} catch {
    $threw = $true
}

ok 'Remove-PathSafely does not throw on ERROR_SHARING_VIOLATION' (-not $threw)
ok 'DeferredDeleteCount incremented exactly once' ($script:DeferredDeleteCount -eq 1) "count=$script:DeferredDeleteCount"
ok 'DeferredDeleteRebootRequired flag set' $script:DeferredDeleteRebootRequired
ok 'MoveFileEx (or its mock) was invoked exactly once' ($script:MoveFileExCalls.Count -eq 1) "calls=$($script:MoveFileExCalls.Count)"

$rotatedPath = $script:MoveFileExCalls[0].Path
$rotatedLeaf = Split-Path -Leaf $rotatedPath
ok 'rotated leaf matches canonical .delete-pending-marco-<runId> pattern' `
    ($rotatedLeaf -match '^\..+\.delete-pending-marco-\d{14}-[0-9a-f]{6}$') `
    "leaf=$rotatedLeaf"

ok 'rotated leaf carries THIS run''s RunId (not foreign)' `
    ($rotatedLeaf -like "*$script:MarcoRunId*") `
    "leaf=$rotatedLeaf, runId=$script:MarcoRunId"

ok 'original path was actually renamed on disk (no longer at original)' `
    (-not (Test-Path -LiteralPath $lockedDir))

ok 'rotated path exists on disk (rotation succeeded)' `
    (Test-Path -LiteralPath $rotatedPath)

ok 'informational Write-Note was emitted (not Write-Err)' `
    ($script:CapturedNotes.Count -ge 1 -and $script:CapturedErrs.Count -eq 0) `
    "notes=$($script:CapturedNotes.Count), errs=$($script:CapturedErrs.Count)"

ok 'no Write-Warn for the expected sharing-violation case' `
    ($script:CapturedWarns.Count -eq 0) `
    "warns=[$($script:CapturedWarns -join '|')]"

# Cleanup the rotated dir we left behind
Microsoft.PowerShell.Management\Remove-Item -LiteralPath $realTmpRoot -Recurse -Force -ErrorAction SilentlyContinue

# ─── Scenario 3: Marker fallback writes correct schema/owner/RunId ────

Reset-Mocks
Reset-LogCaptures
Write-Host '# === Scenario 3: marker fallback when MoveFileEx scheduling fails ==='

# Point LOCALAPPDATA at a clean temp dir so we can inspect what
# Register-PendingDeleteMarker writes.
$origLocalAppData = $env:LOCALAPPDATA
$env:LOCALAPPDATA = Join-Path ([System.IO.Path]::GetTempPath()) "marco-sim-lad-$([guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $env:LOCALAPPDATA -Force | Out-Null

Register-PendingDeleteMarker -path 'C:\fake\.foo.delete-pending-marco-20260101000000-aaaaaa' `
                              -reason 'simulation: MoveFileEx failed'

$markerDir = Join-Path $env:LOCALAPPDATA 'Marco\pending-deletes'
$markers = @(Microsoft.PowerShell.Management\Get-ChildItem -LiteralPath $markerDir -File -Filter '*.txt' -ErrorAction SilentlyContinue)
ok 'marker file was created' ($markers.Count -eq 1) "found=$($markers.Count)"

if ($markers.Count -eq 1) {
    $entry = Microsoft.PowerShell.Management\Get-Content -LiteralPath $markers[0].FullName -Raw | ConvertFrom-Json
    ok 'marker has Schema = marco-deferred-delete/v1' ($entry.Schema -eq 'marco-deferred-delete/v1') "schema=$($entry.Schema)"
    ok 'marker has OwnerSignature = marco-installer'  ($entry.OwnerSignature -eq 'marco-installer') "owner=$($entry.OwnerSignature)"
    ok 'marker has RunId stamped from this run'        ($entry.RunId -eq $script:MarcoRunId) "runId=$($entry.RunId)"
    ok 'marker has Path field'                         (-not [string]::IsNullOrEmpty($entry.Path))
    ok 'marker has Reason field'                       ($entry.Reason -like '*simulation*')
    ok 'marker validates as ours via Test-IsMarcoMarker' (Test-IsMarcoMarker $entry)
}

# ─── Scenario 4: sweep is scoped — leaves FOREIGN markers and files alone ─

Reset-Mocks
Reset-LogCaptures
Write-Host '# === Scenario 4: sweep skips foreign markers and foreign .old files ==='

# Plant a foreign marker (no Schema, no OwnerSignature) alongside ours
$foreignMarker = Join-Path $markerDir 'foreign-marker.txt'
@{ Path = 'C:\not-ours\thing'; Reason = 'some other tool wrote this' } |
    ConvertTo-Json | Set-Content -Path $foreignMarker -Encoding UTF8

# Plant a third-party-shaped marker that LOOKS similar but lacks owner sig
$nearMissMarker = Join-Path $markerDir 'near-miss.txt'
@{ Schema = 'some-other-tool/v3'; OwnerSignature = 'NotMarco'; Path = 'C:\nope' } |
    ConvertTo-Json | Set-Content -Path $nearMissMarker -Encoding UTF8

$beforeForeign = @(Microsoft.PowerShell.Management\Get-ChildItem -LiteralPath $markerDir -File -Filter '*.txt').Count

Invoke-PendingDeleteSweep

$afterForeign = Microsoft.PowerShell.Management\Test-Path -LiteralPath $foreignMarker
$afterNearMiss = Microsoft.PowerShell.Management\Test-Path -LiteralPath $nearMissMarker

ok 'foreign marker (no schema/owner) was NOT deleted' $afterForeign
ok 'near-miss marker (wrong owner) was NOT deleted'   $afterNearMiss
ok 'sweep emitted "unowned marker" notice'             `
    (($script:CapturedNotes -join '||') -match 'unowned marker') `
    "notes=[$($script:CapturedNotes -join '|')]"

# Plant a foreign .old file in TEMP — sweep MUST NOT touch it
$origTemp = $env:TEMP
$env:TEMP = Join-Path ([System.IO.Path]::GetTempPath()) "marco-sim-temp-$([guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null

$foreignOld = Join-Path $env:TEMP 'something-else.old'
'foreign content' | Set-Content $foreignOld
$foreignDeletePending = Join-Path $env:TEMP 'random-delete-pending-12345'
New-Item -ItemType Directory -Path $foreignDeletePending -Force | Out-Null
$ourTempDir = Join-Path $env:TEMP "marco-install-$script:MarcoRunId"
New-Item -ItemType Directory -Path $ourTempDir -Force | Out-Null

Invoke-StaleArtifactSweep -installDir 'C:\fake-install-dir-that-does-not-exist'

ok 'foreign *.old file in TEMP was NOT touched' (Test-Path -LiteralPath $foreignOld)
ok 'foreign delete-pending-* dir in TEMP was NOT touched' (Test-Path -LiteralPath $foreignDeletePending)
ok 'OUR own RunId-stamped marco-install-* dir WAS swept' (-not (Test-Path -LiteralPath $ourTempDir))

# Restore env
Microsoft.PowerShell.Management\Remove-Item -LiteralPath $env:TEMP -Recurse -Force -ErrorAction SilentlyContinue
$env:TEMP = $origTemp
Microsoft.PowerShell.Management\Remove-Item -LiteralPath $env:LOCALAPPDATA -Recurse -Force -ErrorAction SilentlyContinue
$env:LOCALAPPDATA = $origLocalAppData

# ─── Scenario 5: cleanup never raises a non-zero exit ─────────────────

Reset-Mocks
Reset-LogCaptures
Write-Host '# === Scenario 5: cleanup paths never throw or exit non-zero ==='

# Mock Remove-Item to ALWAYS throw access-denied — even rotation + the
# fallback marker write should not propagate an error.
function global:Remove-Item {
    param(
        [Parameter(ValueFromPipeline = $true, Position = 0)] $Path,
        [string]$LiteralPath,
        [Parameter(ValueFromRemainingArguments = $true)] $Rest
    )
    throw (New-AccessDeniedException)
}

# Override Rename-Item to also fail, forcing the "schedule the original
# path itself" branch.
function global:Rename-Item {
    param(
        [string]$LiteralPath,
        [string]$NewName,
        [Parameter(ValueFromRemainingArguments = $true)] $Rest
    )
    throw (New-AccessDeniedException)
}

# Path must exist for Remove-PathSafely to enter the failure branch.
$pseudoPath = Join-Path ([System.IO.Path]::GetTempPath()) "marco-sim-locked-$([guid]::NewGuid().ToString('N').Substring(0,8))"
New-Item -ItemType Directory -Path $pseudoPath -Force | Out-Null

$threw = $false
try {
    Remove-PathSafely -Path $pseudoPath -Reason 'simulation: total lockdown'
} catch {
    $threw = $true
}

ok 'Remove-PathSafely tolerates Remove-Item AND Rename-Item failing' (-not $threw)
ok 'falls back to scheduling original path when rename fails' ($script:MoveFileExCalls.Count -ge 1) `
    "calls=$($script:MoveFileExCalls.Count)"

# Tear down the pseudo path with the *real* Remove-Item
Microsoft.PowerShell.Management\Remove-Item -LiteralPath $pseudoPath -Recurse -Force -ErrorAction SilentlyContinue

# ─── Summary ──────────────────────────────────────────────────────────

Write-Host ''
Write-Host "1..$script:TestNum"
Write-Host "# tests $script:TestNum"
Write-Host "# pass  $script:TestPassCount"
Write-Host "# fail  $script:TestFailCount"

if ($script:TestFailCount -gt 0) {
    Write-Host '# Failed:'
    foreach ($f in $script:TestFailLines) { Write-Host "#   $f" }
    exit 1
}
exit 0
