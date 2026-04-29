#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# Boots the installer mock server on an ephemeral port and prints
#   MOCK_BASE=http://127.0.0.1:<port>
#   MOCK_PID=<pid>
# to stdout — one KEY=VALUE per line — for easy `eval` by callers.
#
# Usage:
#   eval "$(MOCK_LATEST_TAG=v2.500.0 ./start-mock.sh)"
#   ... run tests ...
#   kill "${MOCK_PID}"
#
# Exits non-zero (and writes a diagnostic to stderr) if the server fails
# to bind a port within MOCK_BOOT_TIMEOUT seconds (default 5).
# ─────────────────────────────────────────────────────────────────────

set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_JS="${SCRIPT_DIR}/mock-server.cjs"

if [ ! -f "${SERVER_JS}" ]; then
    printf '✗ mock-server.js not found at %s\n' "${SERVER_JS}" >&2
    exit 2
fi

if ! command -v node >/dev/null 2>&1; then
    printf '✗ node not found in PATH — install Node.js to run installer integration tests\n' >&2
    exit 2
fi

PORT_FILE="$(mktemp -u -t marco-mock-port.XXXXXX)"
export MOCK_PORT_FILE="${PORT_FILE}"
export MOCK_PORT="${MOCK_PORT:-0}"

node "${SERVER_JS}" >&2 &
MOCK_PID=$!

BOOT_TIMEOUT="${MOCK_BOOT_TIMEOUT:-5}"
elapsed=0
while [ ! -s "${PORT_FILE}" ]; do
    if ! kill -0 "${MOCK_PID}" 2>/dev/null; then
        printf '✗ mock-server died during startup\n' >&2
        exit 2
    fi
    if [ "${elapsed}" -ge "${BOOT_TIMEOUT}" ]; then
        printf '✗ mock-server did not write port file within %ss\n' "${BOOT_TIMEOUT}" >&2
        kill "${MOCK_PID}" 2>/dev/null || true
        exit 2
    fi
    sleep 0.1
    elapsed=$((elapsed + 1))
done

PORT="$(cat "${PORT_FILE}")"
echo "MOCK_BASE=http://127.0.0.1:${PORT}"
echo "MOCK_PID=${MOCK_PID}"
echo "MOCK_PORT_FILE=${PORT_FILE}"
