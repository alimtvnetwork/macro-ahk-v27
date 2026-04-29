---
name: Sibling-discovery configuration
description: scripts/install.config.sh + decide_sibling_discovery() — repo-level default for §4 sibling-repo discovery, with strict-mode lockout enforced unconditionally
type: feature
---

# Sibling-discovery configuration (v2.224.0+)

Per-repo configuration mechanism that controls whether `scripts/install.sh`
performs §4 versioned-repo sibling discovery, while guaranteeing the spec's
**rule 6** lockout: discovery NEVER runs in strict mode, no matter how the
user or config tries to enable it.

## Files

- `scripts/install.config.sh` — sourced by `install.sh` on startup if present.
  Holds the project-level defaults: `SIBLING_DISCOVERY_ENABLED`,
  `SIBLING_NAME_PATTERN`, `SIBLING_PROBE_DEPTH`, `SIBLING_PARALLELISM`,
  `SIBLING_PROBE_TIMEOUT_SECS`. For this repo:
  pattern `macro-ahk-v{N}`, depth 20, parallelism 8, timeout 5 s,
  enabled = 0 (off by default per spec §4).
- `scripts/install.sh` — built-in fallbacks (matching the config) so the
  installer still works when downloaded standalone via curl with no config
  file beside it.
- `decide_sibling_discovery()` in `install.sh` — single source of truth
  for whether discovery runs, called once in `main()` after mode is known.

## Priority order (lowest → highest)

1. Built-in defaults baked into `install.sh` (off, sensible §4 numbers).
2. `scripts/install.config.sh` (or `$MARCO_INSTALLER_CONFIG`) values.
3. Environment variables of the same names.
4. `--enable-sibling-discovery` CLI flag.
5. `--no-sibling-discovery` CLI flag.
6. **Strict-mode lockout** — overrides everything (spec §4 rule 6).

Strict mode = URL-pinned (release-asset URL) OR explicit `--version vX.Y.Z`
(but NOT `--version latest`).

## Decision states

`decide_sibling_discovery <is_strict>` sets two globals:

| `SIBLING_DECISION` | Meaning |
|--------------------|---------|
| `off`              | Disabled by config; would not run anyway |
| `on`               | Will run §4 sibling probing |
| `skipped-strict`   | Was enabled but strict mode locked it out (rule 6) |
| `skipped-cli`      | Discovery-mode but `--no-sibling-discovery` won |

`SIBLING_DECISION_REASON` is a human-readable explanation, surfaced in the
`--dry-run` plan as `Sibling discovery: <state> — <reason>`.

## Why a separate config file (vs hardcoding in install.sh)

Forks and downstream consumers of the generic installer pattern (per
`mem://constraints/generic-installer-contract`) only need to swap
`install.config.sh` to change the sibling-discovery defaults — they don't
have to fork the installer logic. The in-script fallbacks ensure
single-file `curl … | bash` installs still behave identically when no
config file ships alongside.

## Tests

- Unit (decision matrix): `tests/installer/resolver.test.sh` "§4 sibling-
  discovery decision matrix" group — 9 assertions covering the priority
  order, including the strict-mode lockout against both config-on and
  `--enable-sibling-discovery`.
- Dry-run plan: same suite, "Dry-run plan shows sibling-discovery
  decision" group — confirms the plan surfaces the decision + reason.
- Integration: the existing `mock-server.test.sh` suite uses the default
  (off) config; it does not yet exercise live HEAD probes because §4
  probing isn't implemented in `install.sh` itself — only the **decision**
  is. When probing lands, add cases that set `MOCK_SIBLINGS=...` and
  assert the chosen sibling.

## Open follow-ups

1. Implement the actual `probe_versioned_siblings()` function in
   `install.sh` (parallel HEAD via `xargs -P` or background curls,
   5 s wall-clock cap).
2. Mirror the config + decision logic in `scripts/install.ps1`
   (PowerShell uses `install.config.ps1`).
3. Wire AC-10 / AC-11 / AC-13 cases in `mock-server.test.sh` once probing
   exists — the mock already responds to `MOCK_SIBLINGS=repo-v3:200,…`.
