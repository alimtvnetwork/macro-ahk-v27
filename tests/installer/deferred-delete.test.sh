#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Marco Extension — install.ps1 deferred-delete static analysis
#
# Validates the Windows reboot-safe deferred-delete machinery in
# scripts/install.ps1 without requiring PowerShell on the runner. Each
# assertion checks that a specific safety primitive is wired into the
# installer per the design memo (mem://features/installer-deferred-delete).
#
# What this catches:
#   - Regression to bare `Remove-Item -Force` in the install path
#     (which fails on Windows when Chrome holds the extension folder)
#   - Missing rename-then-replace pattern in Install-Extension
#   - MoveFileEx P/Invoke surface drift
#   - Missing pending-delete marker fallback
#   - Sweep-on-startup of prior markers no longer wired into Main
#
# Why static + pattern-based: the sandbox doesn't have pwsh, and even if
# it did, exercising MoveFileEx requires a Windows kernel. Treat this as
# a lint/contract test — full E2E lives on a Windows CI runner (TODO).
#
# Run:  bash tests/installer/deferred-delete.test.sh
#       (or)  npm run test:installer
# ─────────────────────────────────────────────────────────────────────

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${REPO_ROOT}/scripts/install.ps1"

if [ ! -f "${INSTALLER}" ]; then
    printf '\033[31m✗ install.ps1 not found at %s\033[0m\n' "${INSTALLER}" >&2
    exit 2
fi

PASS_COUNT=0
FAIL_COUNT=0
FAIL_LINES=()

assert_grep() {
    local label="$1" pattern="$2"
    if grep -qE "${pattern}" "${INSTALLER}"; then
        printf '  \033[32m✓\033[0m %s\n' "${label}"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        printf '  \033[31m✗\033[0m %s\n' "${label}"
        printf '      pattern not found: %s\n' "${pattern}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        FAIL_LINES+=("${label}")
    fi
}

assert_no_grep() {
    local label="$1" pattern="$2"
    if grep -qE "${pattern}" "${INSTALLER}"; then
        printf '  \033[31m✗\033[0m %s\n' "${label}"
        printf '      forbidden pattern present: %s\n' "${pattern}"
        printf '      lines:\n'
        grep -nE "${pattern}" "${INSTALLER}" | sed 's/^/        /' >&2
        FAIL_COUNT=$((FAIL_COUNT + 1))
        FAIL_LINES+=("${label}")
    else
        printf '  \033[32m✓\033[0m %s\n' "${label}"
        PASS_COUNT=$((PASS_COUNT + 1))
    fi
}

assert_count() {
    local label="$1" pattern="$2" expected="$3"
    local actual
    actual=$(grep -cE "${pattern}" "${INSTALLER}")
    if [ "${actual}" = "${expected}" ]; then
        printf '  \033[32m✓\033[0m %s (%d)\n' "${label}" "${actual}"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        printf '  \033[31m✗\033[0m %s — expected %s match(es), found %s\n' \
            "${label}" "${expected}" "${actual}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        FAIL_LINES+=("${label}")
    fi
}

# ── Group: Remove-PathSafely surface ─────────────────────────────────

printf '\n\033[36m▸ Remove-PathSafely helper present\033[0m\n'

assert_grep "Remove-PathSafely function defined" \
    'function[[:space:]]+Remove-PathSafely'
assert_grep "Remove-PathSafely accepts -Path parameter" \
    '\[Parameter\(Mandatory\)\][[:space:]]+\[string\]\$Path'
assert_grep "Remove-PathSafely accepts -Reason parameter" \
    '\[string\]\$Reason'
assert_grep "Remove-PathSafely tries Remove-Item first" \
    'Remove-Item -LiteralPath \$Path -Recurse -Force -ErrorAction Stop'

# ── Group: rename-then-replace pattern ───────────────────────────────

printf '\n\033[36m▸ Rename-then-replace pattern\033[0m\n'

assert_grep "rotated path uses .delete-pending- prefix" \
    '\.delete-pending-'
assert_grep "Rename-Item is used to free original path" \
    'Rename-Item -LiteralPath \$Path'

# ── Group: MoveFileEx P/Invoke surface ───────────────────────────────

printf '\n\033[36m▸ MoveFileEx P/Invoke surface\033[0m\n'

assert_grep "Add-MoveFileExType helper defined" \
    'function[[:space:]]+Add-MoveFileExType'
assert_grep "DllImport kernel32.dll declared" \
    'DllImport\("kernel32\.dll"'
assert_grep "MoveFileEx signature declared" \
    'public[[:space:]]+static[[:space:]]+extern[[:space:]]+bool[[:space:]]+MoveFileEx'
assert_grep "MOVEFILE_DELAY_UNTIL_REBOOT constant" \
    'MOVEFILE_DELAY_UNTIL_REBOOT[[:space:]]*=[[:space:]]*0x4'
assert_grep "GetLastWin32Error captured on failure" \
    'GetLastWin32Error\(\)'
assert_grep "Type-cache guard prevents Add-Type re-registration" \
    "'Marco\.Win32\.NativeMethods'[[:space:]]+-as[[:space:]]+\[type\]"

# ── Group: pending-delete marker fallback ────────────────────────────

printf '\n\033[36m▸ Pending-delete marker fallback\033[0m\n'

assert_grep "Register-PendingDeleteMarker defined" \
    'function[[:space:]]+Register-PendingDeleteMarker'
assert_grep "marker dir under LOCALAPPDATA" \
    'LOCALAPPDATA.*pending-deletes'
assert_grep "marker JSON serializes Path field" \
    'Path[[:space:]]*=[[:space:]]*\$path'
assert_grep "Register-PendingDeleteMarker called from MoveFileEx failure path" \
    'Register-PendingDeleteMarker -path'
assert_grep "Invoke-PendingDeleteSweep defined" \
    'function[[:space:]]+Invoke-PendingDeleteSweep'
assert_grep "sweep wired into Main" \
    'Invoke-PendingDeleteSweep'

# ── Group: cross-platform safety ─────────────────────────────────────

printf '\n\033[36m▸ Cross-platform safety\033[0m\n'

assert_grep "Test-IsWindowsPlatform helper defined" \
    'function[[:space:]]+Test-IsWindowsPlatform'
assert_grep "Invoke-DelayedDelete short-circuits on POSIX" \
    'if[[:space:]]+\(-not[[:space:]]+\(Test-IsWindowsPlatform\)\)'

# ── Group: callsite migration — no bare Remove-Item on install paths ─

printf '\n\033[36m▸ No bare Remove-Item -Recurse -Force on install paths\033[0m\n'

# These were the original three offenders. They MUST now go through
# Remove-PathSafely so the install survives Chrome holding the folder open.
# Permitted: Remove-Item inside Remove-PathSafely / Invoke-PendingDeleteSweep
# itself, where the safety wrapper is the whole point.
assert_no_grep "Install-Extension does NOT call Remove-Item -Recurse on \$installDir" \
    'Remove-Item[[:space:]]+\$installDir'
assert_no_grep "Get-Asset failure path does NOT call Remove-Item -Recurse on \$tmpDir" \
    'Remove-Item[[:space:]]+\$tmpDir[[:space:]]+-Recurse'
assert_no_grep "Main finally does NOT call Remove-Item -Recurse on \$result.TmpDir" \
    'Remove-Item[[:space:]]+\$result\.TmpDir[[:space:]]+-Recurse'

# Positive callsite checks — Remove-PathSafely IS used in each spot.
assert_grep "Install-Extension uses Remove-PathSafely for the install dir" \
    'Remove-PathSafely -Path \$installDir'
assert_grep "Get-Asset failure path uses Remove-PathSafely" \
    'Remove-PathSafely -Path \$tmpDir'
assert_grep "Main finally uses Remove-PathSafely for the temp dir" \
    'Remove-PathSafely -Path \$result\.TmpDir'

# ── Group: user-visible reporting ────────────────────────────────────

printf '\n\033[36m▸ User-visible deferred-delete reporting\033[0m\n'

assert_grep "DeferredDeleteCount script-scope counter" \
    '\$script:DeferredDeleteCount'
assert_grep "DeferredDeleteRebootRequired flag" \
    '\$script:DeferredDeleteRebootRequired'
# Reframed (v2.225+): cleanup-deferred is an informational notice, not a
# warning — install completed successfully and exit code stays 0.
assert_grep "Summary frames deferred-cleanup as success, not failure" \
    'Install completed successfully\..+cleanup deferred'
assert_grep "Summary mentions next reboot when MoveFileEx succeeded" \
    'will be removed at next reboot'
assert_grep "Summary mentions marker fallback path" \
    'pending-deletes'
assert_grep "Summary reassures user no action is needed" \
    'No action needed'

# ── Group: informational logging tone (Write-Note vs Write-Warn) ─────

printf '\n\033[36m▸ Informational logging tone for lock errors\033[0m\n'

assert_grep "Write-Note helper defined for non-fatal notices" \
    'function[[:space:]]+Write-Note'
assert_grep "Invoke-DelayedDelete uses Write-Note on MoveFileEx success" \
    'Write-Note[[:space:]]+"Cleanup deferred to next reboot'
assert_grep "Invoke-DelayedDelete uses Write-Note on marker fallback" \
    'Write-Note[[:space:]]+"Cleanup queued for next install run'
assert_grep "Sharing-violation classifier helper defined" \
    'function[[:space:]]+Test-IsSharingViolation'
assert_grep "Classifier checks ERROR_SHARING_VIOLATION HResult" \
    '[-]2147024864'
assert_grep "Classifier matches 'being used by another process' message" \
    'being used by another process'
# Negative: no Write-Err in any cleanup function (would imply a hard error)
assert_no_grep "No Write-Err inside Remove-PathSafely body" \
    'Write-Err.*(?:locked|sharing|cleanup)'

# ── Group: cleanup never fails the install (no exit from cleanup) ────

printf '\n\033[36m▸ Cleanup paths never call exit\033[0m\n'

assert_no_grep "Remove-PathSafely body does not call exit" \
    'Remove-PathSafely[\s\S]*?\bexit[[:space:]]+[1-9]'
assert_no_grep "Invoke-DelayedDelete does not call exit" \
    'Invoke-DelayedDelete[\s\S]*?\bexit[[:space:]]+[1-9]'
assert_no_grep "Invoke-PendingDeleteSweep does not call exit" \
    'Invoke-PendingDeleteSweep[\s\S]*?\bexit[[:space:]]+[1-9]'

# ── Group: scoped artifact identification (RunId + canonical patterns) ──
#
# Cleanup must only target files this updater actually created. Random
# `.old` files, third-party `delete-pending-*` dirs, and unowned markers
# in pending-deletes/ MUST be left alone.

printf '\n\033[36m▸ Scoped updater-artifact identification\033[0m\n'

# RunId scheme — stamped into every artifact this run creates.
assert_grep "RunId script-scope variable defined" \
    '\$script:MarcoRunId'
assert_grep "RunId format: marco-<timestamp>-<rand>" \
    'marco-\$\(\(Get-Date\)\.ToString'
assert_grep "Marker schema constant defined" \
    "MarcoMarkerSchema[[:space:]]*=[[:space:]]*'marco-deferred-delete/v1'"
assert_grep "Owner-signature constant defined" \
    "MarcoOwnerSignature[[:space:]]*=[[:space:]]*'marco-installer'"

# Temp-dir naming uses RunId (was Get-Random — too easy to collide with foreign tools)
assert_grep "Temp dir name embeds RunId" \
    'marco-install-\$script:MarcoRunId'
assert_no_grep "Temp dir does NOT use generic Get-Random suffix" \
    'marco-install-\$\(Get-Random\)'

# Rotated install dir uses RunId
assert_grep "Rotated install dir embeds RunId" \
    'delete-pending-\$script:MarcoRunId'
assert_no_grep "Rotated install dir does NOT use generic Get-Random suffix" \
    'delete-pending-\$\(Get-Random\)'

# Marker JSON includes schema + owner stamps
assert_grep "Marker writes Schema field" \
    'Schema[[:space:]]+=[[:space:]]+\$script:MarcoMarkerSchema'
assert_grep "Marker writes OwnerSignature field" \
    'OwnerSignature[[:space:]]+=[[:space:]]+\$script:MarcoOwnerSignature'
assert_grep "Marker writes RunId field" \
    'RunId[[:space:]]+=[[:space:]]+\$script:MarcoRunId'

# Canonical-pattern array
assert_grep "Canonical artifact-leaf patterns array defined" \
    '\$script:MarcoArtifactLeafPatterns'
assert_grep "Pattern: temp dir prefix" \
    'marco-install-marco-'
assert_grep "Pattern: gitmap-update-* scratch (forward-compat)" \
    'gitmap-update-marco-'
assert_grep "Pattern: per-file .old.<runId> backup (forward-compat)" \
    '\.old\\.marco-'

# Classifier helpers exist
assert_grep "Test-IsMarcoArtifactLeaf helper defined" \
    'function[[:space:]]+Test-IsMarcoArtifactLeaf'
assert_grep "Test-IsMarcoArtifact helper defined" \
    'function[[:space:]]+Test-IsMarcoArtifact[[:space:]]*\('
assert_grep "Test-IsMarcoMarker helper defined" \
    'function[[:space:]]+Test-IsMarcoMarker'
assert_grep "Find-MarcoUpdaterArtifacts helper defined" \
    'function[[:space:]]+Find-MarcoUpdaterArtifacts'
assert_grep "Find-MarcoArtifactsAt sibling-aware lookup defined" \
    'function[[:space:]]+Find-MarcoArtifactsAt'
assert_grep "Invoke-StaleArtifactSweep defined" \
    'function[[:space:]]+Invoke-StaleArtifactSweep'

# Sweepers MUST gate on the classifier
assert_grep "PendingDeleteSweep validates marker via Test-IsMarcoMarker" \
    'Test-IsMarcoMarker'
assert_grep "PendingDeleteSweep validates path via Test-IsMarcoArtifact" \
    'Test-IsMarcoArtifact[[:space:]]+\$entry\.Path'
assert_grep "StaleArtifactSweep re-validates leaf before deletion" \
    'Test-IsMarcoArtifactLeaf[[:space:]]+\$c\.Name'
assert_grep "Foreign markers are skipped, not deleted" \
    'unowned marker'

# StaleArtifactSweep is wired into Main
assert_grep "Main invokes Invoke-StaleArtifactSweep with install dir" \
    'Invoke-StaleArtifactSweep -installDir \$resolvedDir'

# Negative: sweep must not blanket-delete by glob
assert_no_grep "No blanket Remove-Item of *.old glob" \
    "Remove-Item[^|]*\\*\\.old"

# ── Summary ──────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────────────────────────"
printf 'install.ps1 deferred-delete tests: \033[32m%d passed\033[0m, \033[31m%d failed\033[0m\n' \
    "${PASS_COUNT}" "${FAIL_COUNT}"
echo "─────────────────────────────────────────────────"

if [ "${FAIL_COUNT}" -gt 0 ]; then
    echo ""
    echo "Failed assertions:"
    for line in "${FAIL_LINES[@]}"; do
        printf '  • %s\n' "${line}"
    done
    exit 1
fi
exit 0
