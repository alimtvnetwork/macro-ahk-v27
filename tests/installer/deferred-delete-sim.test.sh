#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Marco Extension — install.ps1 deferred-delete behavioral simulation
#
# Runs a real PowerShell-driven simulation that:
#   1. Synthesizes ERROR_SHARING_VIOLATION (HResult 0x80070020 /
#      -2147024864) and ERROR_ACCESS_DENIED (0x80070005 /
#      -2147024891) exceptions
#   2. Mocks Remove-Item / Rename-Item / Invoke-DelayedDelete to
#      reproduce the locked-file failure mode without needing Chrome
#   3. Drives the production install.ps1 helpers (Remove-PathSafely,
#      Register-PendingDeleteMarker, Invoke-PendingDeleteSweep,
#      Invoke-StaleArtifactSweep) through the failure paths
#   4. Asserts the user-visible behavior: rotation, marker contents,
#      counter increments, scoped-sweep ownership, no-throw guarantee
#
# Requires pwsh (PowerShell 7+). If pwsh is not on PATH, attempts to
# fetch it via `nix run nixpkgs#powershell`. If neither is available,
# prints a SKIP marker and exits 0 — the static-analysis tests in
# deferred-delete.test.sh still cover the contract surface, this suite
# adds behavioral verification on top.
#
# Run:  bash tests/installer/deferred-delete-sim.test.sh
#       (or)  npm run test:installer
# ─────────────────────────────────────────────────────────────────────

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE="${SCRIPT_DIR}/fixtures/deferred-delete-simulation.ps1"

if [ ! -f "${FIXTURE}" ]; then
    printf '\033[31m✗ simulation fixture not found at %s\033[0m\n' "${FIXTURE}" >&2
    exit 2
fi

# Locate pwsh — prefer system install, fall back to nix.
PWSH_CMD=""
if command -v pwsh >/dev/null 2>&1; then
    PWSH_CMD="pwsh"
elif command -v nix >/dev/null 2>&1; then
    printf '\033[36mℹ pwsh not on PATH — using nix run nixpkgs#powershell\033[0m\n'
    PWSH_CMD="nix run nixpkgs#powershell --"
else
    printf '\033[33m⚠ SKIP: pwsh not available and nix not installed.\033[0m\n'
    printf '   Static-analysis coverage in deferred-delete.test.sh still applies.\n'
    printf '   To enable behavioral simulation, install PowerShell 7+ or nix.\n'
    exit 0
fi

printf '\n\033[36m▸ Running deferred-delete behavioral simulation\033[0m\n'
printf '  fixture: %s\n' "${FIXTURE#${PWD}/}"
printf '  pwsh:    %s\n\n' "${PWSH_CMD}"

# Capture both stdout (TAP-ish output) and exit code.
TMP_OUT="$(mktemp)"
trap 'rm -f "${TMP_OUT}"' EXIT

set +e
${PWSH_CMD} -NoProfile -ExecutionPolicy Bypass -File "${FIXTURE}" > "${TMP_OUT}" 2>&1
PS_EXIT=$?
set -e

# Pretty-print results, parse TAP "ok N - desc" / "not ok N - desc"
PASS=0
FAIL=0
FAIL_LINES=()
PLAN_LINE=""
SKIP_REASON=""

while IFS= read -r line; do
    case "${line}" in
        "1..0"*)
            # 0 tests planned — fixture bailed before running anything.
            SKIP_REASON="${line}"
            ;;
        "ok "*)
            PASS=$((PASS + 1))
            # Strip "ok N - " prefix for compactness
            desc="${line#ok * - }"
            printf '  \033[32m✓\033[0m %s\n' "${desc}"
            ;;
        "not ok "*)
            FAIL=$((FAIL + 1))
            desc="${line#not ok * - }"
            printf '  \033[31m✗\033[0m %s\n' "${desc}"
            FAIL_LINES+=("${desc}")
            ;;
        "1.."*)
            PLAN_LINE="${line}"
            ;;
        "# === "*)
            # Scenario header from the fixture
            scenario="${line#\# === }"
            scenario="${scenario% ===}"
            printf '\n  \033[35m·\033[0m %s\n' "${scenario}"
            ;;
        "  # "*)
            # Inline detail attached to a failing assertion
            printf '      \033[2m%s\033[0m\n' "${line# *# }"
            ;;
        "# Failed:"*|"# tests "*|"# pass "*|"# fail "*|"#   #"*)
            # Suppress the fixture's own footer — we render our own.
            ;;
        *)
            # Unrecognised lines: surface only if non-empty, dimmed
            if [ -n "${line}" ]; then
                printf '      \033[2m%s\033[0m\n' "${line}"
            fi
            ;;
    esac
done < "${TMP_OUT}"

echo ""
echo "─────────────────────────────────────────────────"

if [ -n "${SKIP_REASON}" ]; then
    printf '\033[33mSimulation skipped (fixture exit %d): %s\033[0m\n' "${PS_EXIT}" "${SKIP_REASON}"
    exit 0
fi

if [ -z "${PLAN_LINE}" ]; then
    printf '\033[31m✗ fixture did not emit a TAP plan — likely crashed before assertions ran\033[0m\n'
    echo "  Raw output:"
    sed 's/^/    /' "${TMP_OUT}" >&2
    exit 1
fi

printf 'Deferred-delete simulation: \033[32m%d passed\033[0m, \033[31m%d failed\033[0m  (pwsh exit %d)\n' \
    "${PASS}" "${FAIL}" "${PS_EXIT}"
echo "─────────────────────────────────────────────────"

if [ "${FAIL}" -gt 0 ] || [ "${PS_EXIT}" -ne 0 ]; then
    echo ""
    if [ "${#FAIL_LINES[@]}" -gt 0 ]; then
        echo "Failed assertions:"
        for line in "${FAIL_LINES[@]}"; do
            printf '  • %s\n' "${line}"
        done
    fi
    exit 1
fi
exit 0
