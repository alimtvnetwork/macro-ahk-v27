#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Marco Extension — Installer Resolver Test Suite
#
# Validates the resolver behavior of scripts/install.sh against the
# Generic Installer Behavior specification:
#   spec/14-update/01-generic-installer-behavior.md
#
# Coverage map (acceptance criteria from §8 of the spec):
#   AC-3   URL-pinned strict mode (release-asset URL → strict)
#   AC-4   --version vX.Y.Z strict mode (semver pin)
#   AC-5   --version + 404 asset → exit 4 (NOT auto-implemented yet —
#          we test the download path with a mocked failing curl)
#   AC-6   --version garbage → exit 3
#   AC-7   --version latest → API lookup
#   AC-8   API unreachable, no --version → exit 5
#   AC-9   --version vX.Y.Z + API down → succeeds (API never consulted)
#   AC-12  --no-sibling-discovery → flag accepted; sets NO_SIBLING_DISCOVERY=1
#   AC-14  --dry-run --version vX.Y.Z → prints plan, exits 0, installs nothing
#
# Acceptance criteria not exercised here (require sibling discovery to land):
#   AC-10, AC-11, AC-13 — opt-in §4 sibling-repo discovery is not yet wired.
#
# Test mechanism
# --------------
# The installer is sourced under MARCO_INSTALLER_TEST_MODE=1 so its
# functions become available without auto-running main(). curl/wget are
# shadowed by a per-test PATH containing controllable mock binaries so
# the suite never touches the network.
#
# Run:  bash tests/installer/resolver.test.sh
#       (or)  npm run test:installer
# ─────────────────────────────────────────────────────────────────────

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
INSTALLER="${REPO_ROOT}/scripts/install.sh"

if [ ! -f "${INSTALLER}" ]; then
    printf '\033[31m✗ Installer not found at %s\033[0m\n' "${INSTALLER}" >&2
    exit 2
fi

# ── Test harness ─────────────────────────────────────────────────────

PASS_COUNT=0
FAIL_COUNT=0
FAIL_LINES=()

assert_eq() {
    local label="$1" expected="$2" actual="$3"
    if [ "${expected}" = "${actual}" ]; then
        printf '  \033[32m✓\033[0m %s\n' "${label}"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        printf '  \033[31m✗\033[0m %s\n' "${label}"
        printf '      expected: %q\n' "${expected}"
        printf '      actual:   %q\n' "${actual}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        FAIL_LINES+=("${label}")
    fi
}

assert_contains() {
    local label="$1" needle="$2" haystack="$3"
    if [[ "${haystack}" == *"${needle}"* ]]; then
        printf '  \033[32m✓\033[0m %s\n' "${label}"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        printf '  \033[31m✗\033[0m %s\n' "${label}"
        printf '      needle:   %q\n' "${needle}"
        printf '      haystack: %q\n' "${haystack}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
        FAIL_LINES+=("${label}")
    fi
}

# ── Mock helpers ─────────────────────────────────────────────────────

# Build a temp PATH-shadowed mock for curl that mimics real curl's
# observable behavior used by install.sh's fetch_latest_version:
#   - Honors -o <file>  → writes body to that file (NOT stdout).
#   - Honors -w <fmt>   → on success, prints the formatted value to stdout.
#                          We support %{http_code} only.
#   - Without -o, writes body to stdout (used by download() / sibling probes).
# This is required because fetch_latest_version uses
#   curl -sSL -o BODY -w '%{http_code}' URL
# to differentiate HTTP 200+empty (AC-2 main fallback) from 5xx/network
# (AC-8 exit 5). A naïve mock that ignored -o/-w would feed the body into
# the http_code variable and break the case-statement dispatch.
make_mock_curl() {
    local mode="$1" body="${2:-}"
    MOCK_DIR="$(mktemp -d)"
    case "${mode}" in
        success)      MOCK_HTTP=200; MOCK_BODY="${body}"; MOCK_EXIT=0 ;;
        network_fail) MOCK_HTTP=000; MOCK_BODY="";        MOCK_EXIT=6 ;;
        not_found)    MOCK_HTTP=404; MOCK_BODY="";        MOCK_EXIT=22 ;;
    esac
    # Use a heredoc with EXPANDED expansion to bake values in, then a
    # quoted heredoc for the runtime parsing logic.
    cat >"${MOCK_DIR}/curl" <<MOCKEOF
#!/usr/bin/env bash
# Mock curl — mode=${mode}
MOCK_HTTP='${MOCK_HTTP}'
MOCK_EXIT='${MOCK_EXIT}'
read -r -d '' MOCK_BODY <<'BODYEOF' || true
${MOCK_BODY}
BODYEOF
MOCKEOF
    cat >>"${MOCK_DIR}/curl" <<'MOCKEOF'
out_file=""
write_fmt=""
while [ $# -gt 0 ]; do
    case "$1" in
        -o)  out_file="$2"; shift 2 ;;
        -w)  write_fmt="$2"; shift 2 ;;
        --)  shift; break ;;
        *)   shift ;;
    esac
done
if [ "${MOCK_EXIT}" -ne 0 ]; then
    echo "curl: mock failure (mode exit=${MOCK_EXIT})" >&2
    exit "${MOCK_EXIT}"
fi
if [ -n "${out_file}" ]; then
    printf '%s' "${MOCK_BODY}" > "${out_file}"
else
    printf '%s' "${MOCK_BODY}"
fi
if [ -n "${write_fmt}" ]; then
    case "${write_fmt}" in
        *%\{http_code\}*) printf '%s' "${MOCK_HTTP}" ;;
        *)                 printf '%s' "${write_fmt}" ;;
    esac
fi
exit 0
MOCKEOF
    chmod +x "${MOCK_DIR}/curl"
    # Also shadow wget so the installer cannot fall through to it.
    cat >"${MOCK_DIR}/wget" <<'MOCKEOF'
#!/usr/bin/env bash
echo "mock wget called — should not happen in tests" >&2
exit 99
MOCKEOF
    chmod +x "${MOCK_DIR}/wget"
}

cleanup_mock() {
    if [ -n "${MOCK_DIR:-}" ] && [ -d "${MOCK_DIR}" ]; then
        rm -rf "${MOCK_DIR}"
    fi
    MOCK_DIR=""
}

# Run a snippet against the sourced installer in a clean subshell.
# Usage:  run_resolver [mock_path] '<bash code that uses installer fns>'
# The snippet runs *inside* the subshell that sourced the installer so the
# resolve_version / parse_args / is_valid_version / version_from_url
# functions are directly callable. set +u relaxes nounset because the
# installer relies on optional vars.
run_resolver() {
    local mock_path="$1"
    local snippet="$2"
    (
        set +u
        export MARCO_INSTALLER_TEST_MODE=1
        if [ -n "${mock_path}" ]; then
            export PATH="${mock_path}:${PATH}"
        fi
        # shellcheck disable=SC1090
        source "${INSTALLER}"
        eval "${snippet}"
    )
}

# ── Group: helper-level resolver primitives ──────────────────────────

printf '\n\033[36m▸ is_valid_version (semver guard)\033[0m\n'

run_resolver "" 'is_valid_version "v1.2.3" && echo OK || echo FAIL'
out=$(run_resolver "" 'is_valid_version "v1.2.3" && echo OK || echo FAIL')
assert_eq "v1.2.3 is valid"        "OK"   "${out}"

out=$(run_resolver "" 'is_valid_version "v2.224.0-rc.1" && echo OK || echo FAIL')
assert_eq "v2.224.0-rc.1 is valid" "OK"   "${out}"

out=$(run_resolver "" 'is_valid_version "1.2.3"   && echo OK || echo FAIL')
assert_eq "1.2.3 (no v) rejected"  "FAIL" "${out}"

out=$(run_resolver "" 'is_valid_version "garbage" && echo OK || echo FAIL')
assert_eq "'garbage' rejected"     "FAIL" "${out}"

out=$(run_resolver "" 'is_valid_version "latest"  && echo OK || echo FAIL')
assert_eq "'latest' rejected by regex" "FAIL" "${out}"

# ── Group: AC-3 — URL-pinned strict mode ─────────────────────────────

printf '\n\033[36m▸ AC-3 — URL-pinned strict mode\033[0m\n'

out=$(run_resolver "" '
    MARCO_INSTALLER_URL="https://github.com/owner/repo/releases/download/v1.2.3/install.sh"
    export MARCO_INSTALLER_URL
    version_from_url
')
assert_eq "version_from_url extracts v1.2.3 from release URL" "v1.2.3" "${out}"

out=$(run_resolver "" '
    MARCO_INSTALLER_URL="https://raw.githubusercontent.com/owner/repo/main/scripts/install.sh"
    export MARCO_INSTALLER_URL
    version_from_url || echo NO_PIN
')
assert_eq "version_from_url returns NO_PIN for raw.githubusercontent (no pin)" \
    "NO_PIN" "${out}"

# Full resolve_version path with a URL pin → returns the version, sets URL_PINNED.
# Run resolve_version in the *current* shell (no $()) so URL_PINNED survives.
out=$(run_resolver "" '
    MARCO_INSTALLER_URL="https://github.com/owner/repo/releases/download/v9.9.9/install.sh"
    export MARCO_INSTALLER_URL
    # Capture stdout to a temp file so the global URL_PINNED stays in this shell.
    tmp=$(mktemp)
    resolve_version "" 2>/dev/null >"${tmp}"
    v=$(cat "${tmp}"); rm -f "${tmp}"
    echo "${v}|${URL_PINNED}"
' 2>/dev/null)
assert_eq "resolve_version URL-pin returns version + sets URL_PINNED=1" \
    "v9.9.9|1" "${out}"

# ── Group: AC-4 — --version semver strict mode ───────────────────────

printf '\n\033[36m▸ AC-4 — --version <semver> strict\033[0m\n'

out=$(run_resolver "" 'resolve_version "v2.224.0"' 2>/dev/null)
assert_eq "resolve_version v2.224.0 → v2.224.0 (no API call)" \
    "v2.224.0" "${out}"

# ── Group: AC-6 — invalid version → exit 3 ───────────────────────────

printf '\n\033[36m▸ AC-6 — invalid --version → exit 3\033[0m\n'

(run_resolver "" 'resolve_version "garbage"' >/dev/null 2>&1)
assert_eq "resolve_version garbage exits 3" "3" "$?"

(run_resolver "" 'resolve_version "1.2.3"' >/dev/null 2>&1)
assert_eq "resolve_version 1.2.3 (no v) exits 3" "3" "$?"

# ── Group: AC-7 — --version latest forces API lookup ─────────────────

printf '\n\033[36m▸ AC-7 — --version latest → API lookup\033[0m\n'

make_mock_curl success '{"tag_name":"v2.300.0"}'
out=$(run_resolver "${MOCK_DIR}" 'resolve_version "latest"' 2>/dev/null)
assert_eq "resolve_version latest returns API tag" "v2.300.0" "${out}"
cleanup_mock

# ── Group: AC-8 — API unreachable, no --version → exit 5 ─────────────

printf '\n\033[36m▸ AC-8 — API unreachable + no version → exit 5\033[0m\n'

make_mock_curl network_fail
(run_resolver "${MOCK_DIR}" 'resolve_version ""' >/dev/null 2>&1)
assert_eq "resolve_version (no override, API down) exits 5" "5" "$?"
cleanup_mock

# ── Group: AC-9 — strict mode + API down still succeeds ──────────────

printf '\n\033[36m▸ AC-9 — strict mode + API down → succeeds\033[0m\n'

make_mock_curl network_fail
out=$(run_resolver "${MOCK_DIR}" 'resolve_version "v1.2.3"' 2>/dev/null)
rc=$?
assert_eq "resolve_version v1.2.3 ignores API failure (rc=0)" "0" "${rc}"
assert_eq "resolve_version v1.2.3 still returns v1.2.3"        "v1.2.3" "${out}"
cleanup_mock

# Also: URL-pin + API down should succeed.
make_mock_curl network_fail
out=$(run_resolver "${MOCK_DIR}" '
    MARCO_INSTALLER_URL="https://github.com/o/r/releases/download/v3.0.0/install.sh"
    export MARCO_INSTALLER_URL
    resolve_version ""
' 2>/dev/null)
assert_eq "URL-pinned resolve survives API outage" "v3.0.0" "${out}"
cleanup_mock

# ── Group: AC-12 — --no-sibling-discovery flag accepted ──────────────

printf '\n\033[36m▸ AC-12 — --no-sibling-discovery flag\033[0m\n'

out=$(run_resolver "" '
    parse_args --no-sibling-discovery
    echo "${NO_SIBLING_DISCOVERY}"
')
assert_eq "--no-sibling-discovery sets NO_SIBLING_DISCOVERY=1" "1" "${out}"

out=$(run_resolver "" '
    parse_args
    echo "${NO_SIBLING_DISCOVERY}"
')
assert_eq "default NO_SIBLING_DISCOVERY=0" "0" "${out}"

out=$(run_resolver "" '
    parse_args --enable-sibling-discovery
    echo "${ENABLE_SIBLING_DISCOVERY_FLAG}"
')
assert_eq "--enable-sibling-discovery sets flag=1" "1" "${out}"

# ── Group: §4 sibling-discovery decision matrix ──────────────────────
# Spec §4 rule 6: strict mode unconditionally locks out discovery.
# Priority order: built-in default (off) < config/env < --enable-… <
# --no-sibling-discovery < strict-mode lockout.

printf '\n\033[36m▸ §4 sibling-discovery decision matrix\033[0m\n'

# Default: config off, discovery mode → off, reason cites disabled-by-config.
out=$(run_resolver "" '
    SIBLING_DISCOVERY_ENABLED=0
    parse_args
    decide_sibling_discovery 0
    echo "${SIBLING_DECISION}|${SIBLING_DECISION_REASON}"
')
assert_eq "default off + discovery → off" "off" "${out%%|*}"
assert_contains "default off reason cites config" "disabled by config" "${out#*|}"

# Config on, discovery mode, no flags → on.
out=$(run_resolver "" '
    SIBLING_DISCOVERY_ENABLED=1
    parse_args
    decide_sibling_discovery 0
    echo "${SIBLING_DECISION}"
')
assert_eq "config on + discovery → on" "on" "${out}"

# Config on, strict mode → skipped-strict (the lockout — the headline rule).
out=$(run_resolver "" '
    SIBLING_DISCOVERY_ENABLED=1
    parse_args
    decide_sibling_discovery 1
    echo "${SIBLING_DECISION}|${SIBLING_DECISION_REASON}"
')
assert_eq "config on + strict → skipped-strict" "skipped-strict" "${out%%|*}"
assert_contains "skipped-strict reason cites rule 6" "rule 6" "${out#*|}"

# CLI --no-sibling-discovery beats config-on in discovery mode.
out=$(run_resolver "" '
    SIBLING_DISCOVERY_ENABLED=1
    parse_args --no-sibling-discovery
    decide_sibling_discovery 0
    echo "${SIBLING_DECISION}"
')
assert_eq "config on + --no-sibling-discovery → skipped-cli" "skipped-cli" "${out}"

# CLI --enable-sibling-discovery flips a config-off project to on (in discovery).
out=$(run_resolver "" '
    SIBLING_DISCOVERY_ENABLED=0
    parse_args --enable-sibling-discovery
    decide_sibling_discovery 0
    echo "${SIBLING_DECISION}"
')
assert_eq "config off + --enable-sibling-discovery → on" "on" "${out}"

# CLI --enable-sibling-discovery is STILL locked out by strict mode.
out=$(run_resolver "" '
    SIBLING_DISCOVERY_ENABLED=0
    parse_args --enable-sibling-discovery
    decide_sibling_discovery 1
    echo "${SIBLING_DECISION}"
')
assert_eq "--enable + strict → skipped-strict (rule 6 wins)" "skipped-strict" "${out}"

# Both --enable AND --no-sibling-discovery passed → --no wins (in discovery mode).
out=$(run_resolver "" '
    SIBLING_DISCOVERY_ENABLED=0
    parse_args --enable-sibling-discovery --no-sibling-discovery
    decide_sibling_discovery 0
    echo "${SIBLING_DECISION}"
')
assert_eq "both flags → --no-sibling-discovery wins" "skipped-cli" "${out}"

# Config defaults file is sourced — pattern visible.
out=$(run_resolver "" 'echo "${SIBLING_NAME_PATTERN}"')
assert_contains "config file populates SIBLING_NAME_PATTERN" "{N}" "${out}"

# ── Group: AC-14 — --dry-run --version → exit 0, no install ──────────

printf '\n\033[36m▸ AC-14 — --dry-run prints plan, exits 0\033[0m\n'

# Run the full installer end-to-end in dry-run mode. Must not call curl.
# Use a sentinel mock that fails loudly if invoked.
MOCK_DIR="$(mktemp -d)"
cat >"${MOCK_DIR}/curl" <<'MOCKEOF'
#!/usr/bin/env bash
echo "DRY_RUN_LEAKED_TO_NETWORK" >&2
exit 99
MOCKEOF
chmod +x "${MOCK_DIR}/curl"

dryrun_out=$(PATH="${MOCK_DIR}:${PATH}" bash "${INSTALLER}" --dry-run --version v1.2.3 --dir /tmp/marco-dryrun-test 2>&1)
dryrun_rc=$?
assert_eq "dry-run exit code"      "0" "${dryrun_rc}"
assert_contains "dry-run prints version line"     "Version:     v1.2.3" "${dryrun_out}"
assert_contains "dry-run prints strict banner"    "Strict mode"          "${dryrun_out}"
assert_contains "dry-run prints completion line"  "Dry run complete"     "${dryrun_out}"
# Must not have created the install dir.
if [ ! -d "/tmp/marco-dryrun-test" ]; then
    printf '  \033[32m✓\033[0m dry-run did not create install dir\n'
    PASS_COUNT=$((PASS_COUNT + 1))
else
    printf '  \033[31m✗\033[0m dry-run leaked: /tmp/marco-dryrun-test exists\n'
    rm -rf /tmp/marco-dryrun-test
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAIL_LINES+=("dry-run did not create install dir")
fi
cleanup_mock

# ── Group: discovery banner (no --version, mocked latest API) ────────

printf '\n\033[36m▸ Discovery-mode banner sanity\033[0m\n'

make_mock_curl success '{"tag_name":"v2.500.0"}'
discovery_out=$(PATH="${MOCK_DIR}:${PATH}" bash "${INSTALLER}" --dry-run --dir /tmp/marco-disc-test 2>&1)
discovery_rc=$?
assert_eq "discovery dry-run exit code" "0" "${discovery_rc}"
assert_contains "discovery banner present" "Discovery mode" "${discovery_out}"
assert_contains "discovery shows resolved version" "v2.500.0" "${discovery_out}"
rm -rf /tmp/marco-disc-test 2>/dev/null
cleanup_mock

# ── Group: --help exits 0 with usage text ────────────────────────────

printf '\n\033[36m▸ --help exits 0 + mentions spec\033[0m\n'

help_out=$(bash "${INSTALLER}" --help 2>&1)
help_rc=$?
assert_eq "--help exit code" "0" "${help_rc}"
assert_contains "--help mentions spec link" \
    "spec/14-update/01-generic-installer-behavior.md" "${help_out}"
assert_contains "--help lists --no-sibling-discovery" \
    "--no-sibling-discovery" "${help_out}"
assert_contains "--help lists --enable-sibling-discovery" \
    "--enable-sibling-discovery" "${help_out}"
assert_contains "--help lists --dry-run" "--dry-run" "${help_out}"
assert_contains "--help mentions install.config.sh" "install.config.sh" "${help_out}"

# ── Group: dry-run plan reflects sibling-discovery decision ──────────

printf '\n\033[36m▸ Dry-run plan shows sibling-discovery decision\033[0m\n'

# Strict mode (--version vX.Y.Z) with config-on env → must show skipped-strict.
plan_out=$(SIBLING_DISCOVERY_ENABLED=1 bash "${INSTALLER}" --dry-run --version v1.2.3 \
    --dir /tmp/marco-plan-strict 2>&1)
assert_contains "strict-mode dry-run plan shows skipped-strict" \
    "skipped-strict" "${plan_out}"
assert_contains "strict-mode dry-run plan cites rule 6" "rule 6" "${plan_out}"
rm -rf /tmp/marco-plan-strict 2>/dev/null

# Discovery mode + --enable-sibling-discovery → on.
make_mock_curl success '{"tag_name":"v2.600.0"}'
plan_out=$(PATH="${MOCK_DIR}:${PATH}" bash "${INSTALLER}" --dry-run \
    --enable-sibling-discovery --dir /tmp/marco-plan-on 2>&1)
assert_contains "discovery + --enable plan shows 'on'" "on" "${plan_out}"
rm -rf /tmp/marco-plan-on 2>/dev/null
cleanup_mock

# ── Summary ──────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────────────────────────"
printf 'Installer resolver tests: \033[32m%d passed\033[0m, \033[31m%d failed\033[0m\n' \
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
