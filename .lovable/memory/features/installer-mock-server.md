---
name: Installer mock-server fixtures
description: Local Node HTTP server that simulates GitHub releases API + sibling-repo HEAD probes + release-asset ZIPs so installer tests run with zero network access
type: feature
---

# Installer mock-server fixtures (v2.224.0+)

Zero-dependency Node HTTP server at
`tests/installer/fixtures/mock-server.cjs` plus a bash boot helper at
`tests/installer/fixtures/start-mock.sh`. Powers the integration suite
`tests/installer/mock-server.test.sh` (23 assertions, no network).

## Why this exists

The unit-level resolver suite (`resolver.test.sh`) shadows `curl` with
shell mocks — fast but it can't catch real HTTP / ZIP / extraction
bugs. The mock server lets `scripts/install.sh` reach a live HTTP
endpoint over loopback and exercises the full pipeline (resolve →
download → unzip → manifest check → `VERSION` write).

## How tests redirect the installer

`scripts/install.sh` exposes two env-var hooks (default to real GitHub):

```
MARCO_API_BASE       # default https://api.github.com
MARCO_DOWNLOAD_BASE  # default https://github.com
```

Tests set both to the mock's `http://127.0.0.1:<port>`. Production
behavior is unchanged when the vars are unset.

## Mock server endpoints

| Method + path                                        | Purpose                                  |
|------------------------------------------------------|------------------------------------------|
| `GET  /repos/:o/:r/releases/latest`                  | Returns `{ "tag_name": "$MOCK_LATEST_TAG" }` |
| `HEAD /repos/:o/:r`                                  | Sibling-repo discovery probe (200/404)   |
| `GET  /:o/:r/releases/download/:tag/:asset`          | Streams a synthetic minimal ZIP containing `manifest.json` |

## Mock server env vars

- `MOCK_LATEST_TAG` — tag returned by the latest API (default `v2.224.0`)
- `MOCK_API_FAIL=1` — `/releases/latest` returns 503 (test exit-5 path)
- `MOCK_API_FAIL=timeout` — never responds (forces curl timeout)
- `MOCK_SIBLINGS=repo-v3:200,repo-v4:404` — wires HEAD probe outcomes
- `MOCK_MISSING_ASSETS=v9.9.9,v0.0.1` — those tags' ZIPs return 404
  (test exit-4 path)
- `MOCK_PORT=0` — ephemeral port (default); `start-mock.sh` writes the
  resolved port to `MOCK_PORT_FILE` and prints `MOCK_BASE=...` for `eval`
- `MOCK_LOG=1` — logs every request to stderr

## Lifecycle pattern in tests

```bash
eval "$(MOCK_LATEST_TAG=v2.500.0 bash tests/installer/fixtures/start-mock.sh)"
out=$(MARCO_API_BASE="${MOCK_BASE}" MARCO_DOWNLOAD_BASE="${MOCK_BASE}" \
      bash scripts/install.sh --version latest --dir /tmp/x 2>&1)
kill "${MOCK_PID}"; wait "${MOCK_PID}" 2>/dev/null
```

## Coverage map vs spec §8

The integration suite covers AC-3 / AC-4 / AC-5 / AC-7 / AC-8 / AC-9
end-to-end (real ZIPs, real `unzip`, real `manifest.json` check).
Sibling-discovery ACs (10/11/13) are **not yet wired** — when §4
sibling probing lands in `install.sh`, add cases that call `start-mock.sh`
with `MOCK_SIBLINGS=...` and assert the chosen sibling.

## Production bug uncovered while building this

In `main()`, `URL_PINNED=1` was set inside `$(resolve_version ...)`
(subshell) and lost on return. The strict-mode banner + "(pinned via
release URL)" summary tag silently fell into the discovery branch.
Fixed by re-probing `version_from_url` in the parent shell before the
`resolve_version` call. The mock-server suite caught this — the unit
suite couldn't, because it called `resolve_version` directly.

## Run

- `npm run test:installer` — both suites
- `npm run test:installer:resolver` — unit only
- `npm run test:installer:mock` — integration only
