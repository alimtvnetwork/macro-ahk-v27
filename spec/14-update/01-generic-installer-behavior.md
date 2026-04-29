# Generic Installation Script Behavior — Cross-Repository Specification

> **Status:** Active · **Version:** 1.0.0 · **Updated:** 2026-04-22
> **Audience:** Any AI or human implementing an install script in any repository.
> **Scope:** Repository-agnostic. No project-specific names, paths, or tooling.
> **Authoritative location:** `spec/14-update/01-generic-installer-behavior.md`
>
> Share this single file with any AI to bootstrap a compliant installer in another repo.

---

## 0. Why this spec exists

Every project eventually ships at least one installation entry point — `install.sh`, `install.ps1`, `quick-install`, `release-install`, or a feature-scoped variant such as `error-manage-install`. Without a shared contract, each implementation diverges on the most consequential question: **"What do I install when the user did not specify a version?"** This spec defines the single correct answer, the strict mode that overrides it, and the optional version-discovery behavior — written generically so the same rules can be lifted into any repository, in any language, on any platform.

---

## 1. Terminology (normative)

| Term | Definition |
|------|------------|
| **Installer script** | Any executable file whose primary purpose is to fetch and install a release of the project. Examples: `install.sh`, `install.ps1`, `quick-install.*`, `release-install.*`, `bootstrap.*`, feature-scoped variants. |
| **Release tag** | A semver-shaped identifier (`vMAJOR.MINOR.PATCH[-pre]`) corresponding to a published artifact in the project's release host (GitHub Releases, GitLab Releases, custom CDN, etc.). |
| **Main branch** | The repository's default development branch (`main`, `master`, `trunk`, `develop` — whichever the project designates). |
| **Strict mode** | The installer was given an exact version, either via flag or via the URL it was downloaded from. Fallback is forbidden. |
| **Discovery mode** | The installer was given no version and no URL hint. It must resolve a version itself, optionally probing for newer sibling repositories. |
| **Versioned repository family** | A naming convention where successive major rewrites live in sibling repos: `myproject`, `myproject-v2`, `myproject-v3`, … (or `myproject2`, `myproject_v2`, etc.). The pattern is project-defined; the discovery algorithm is generic. |
| MUST / SHOULD / MAY | RFC 2119 keywords. |

---

## 2. Resolution algorithm (the core contract)

Every installer MUST follow exactly this decision order. **There are no other branches.**

```
function resolve_version(user_flag, script_source_url):

    # ─── Step 1: explicit user flag wins, period ─────────────────────────
    if user_flag is provided:
        if user_flag == "latest":
            return query_latest_release_api()        # discovery mode
        if user_flag matches /^v\d+\.\d+\.\d+(-[\w.]+)?$/:
            return user_flag                         # STRICT mode
        exit 3 "invalid --version format"

    # ─── Step 2: derive from the URL the script was fetched from ─────────
    # If the script lives at a release-asset URL, the version is implicit.
    if script_source_url matches release-asset pattern:
        # e.g.  /releases/download/(vX.Y.Z)/install.sh
        return captured_version                      # STRICT mode (URL-pinned)

    # ─── Step 3: no version anywhere → discovery ─────────────────────────
    candidate = query_latest_release_api()
    if candidate exists:
        return candidate                             # discovery mode

    # ─── Step 4: optional sibling-repo discovery (see §4) ────────────────
    if SIBLING_DISCOVERY_ENABLED:
        newer_sibling = probe_versioned_siblings()
        if newer_sibling found:
            return newer_sibling.latest_release      # discovery mode

    # ─── Step 5: final fallback — main branch ────────────────────────────
    return MAIN_BRANCH_REF                           # discovery mode
```

### 2.1 Strict mode rules (§2 step 1 with explicit version, or step 2)

When strict mode is active, the installer **MUST**:

1. Install **exactly** the requested version. Byte-for-byte the published artifact.
2. **NEVER** fall back to: a different release, the main branch, a sibling repo, a "compatible" version, or a guessed version.
3. If the requested artifact returns 404 or is otherwise unavailable, **exit with code 4** and a message that names: the exact version requested, the exact URL attempted, and a one-line remediation hint.
4. Print a short banner indicating strict mode is active (e.g. `🔒 Pinned to vX.Y.Z`) so the user is never surprised.

### 2.2 Discovery mode rules (§2 steps 3–5)

When discovery mode is active, the installer **MUST**:

1. Prefer the latest published release over the main branch — releases are presumed stable.
2. Only fall through to the main branch if the release host is reachable but reports zero releases — either as `200 OK` with an empty/`{}` body or as `404 Not Found` on the latest-release endpoint (a brand-new project) — **or** the project explicitly opts into "always main" mode. The branch name is project-defined (default `main`); fetched as a source tarball over the same scheme as the API.
3. Print a short banner indicating which source was chosen (`🌊 Latest release vX.Y.Z` or `🌿 Main branch (no releases found)`).
4. **NEVER** print "pinned" language — discovery mode is opt-out by re-running with `--version`.

### 2.3 Network failure rules

If the latest-release API call fails (network down, rate-limited, host returns 5xx):

- **Discovery mode:** exit 5 with a clear message. Do **NOT** silently fall through to main — the user might have intended to get a real release.
- **Strict mode:** the API is not consulted, so this case does not apply.

---

## 3. Exit-code contract (normative)

Every installer MUST use these codes consistently so that CI pipelines can react reliably.

| Code | Meaning |
|------|---------|
| 0 | Install succeeded |
| 1 | Reserved — OS / platform detection failed |
| 2 | Reserved — unexpected internal failure |
| 3 | Invalid `--version` argument (malformed; not semver-shaped) |
| 4 | Targeted release artifact missing (404) — strict mode only |
| 5 | Network or required tooling failure (no `curl`/`wget`, API timeout) |
| 6 | Downloaded archive is invalid (empty, no manifest, checksum mismatch) |

Codes 7+ are project-reserved.

---

## 4. Versioned-repository sibling discovery (optional)

Some projects ship major rewrites as **separate repositories** rather than as breaking releases inside one repo: `myproject`, `myproject-v2`, `myproject-v3`, etc. When a user installs from an old repo, they often want the **newest** family member. This section defines a generic, opt-in algorithm for finding it.

### 4.1 Activation

Sibling discovery is **off by default**. A project enables it by setting two configuration values in its installer:

```
SIBLING_DISCOVERY_ENABLED = true
SIBLING_NAME_PATTERN      = "<base>{separator}v{N}"   # e.g. "myproject-v2"
SIBLING_PROBE_DEPTH       = 20                         # how many ahead to probe
SIBLING_PARALLELISM       = 8                          # concurrent HEAD requests
```

The pattern uses two placeholders: `<base>` (the un-suffixed repository name) and `{N}` (the version integer). The separator (`-`, `_`, `.`, or empty string) is project-defined.

### 4.2 Algorithm

```
function probe_versioned_siblings():
    base, current_v = parse_current_repo_name()      # e.g. ("myproject", 2)
    if current_v is null: current_v = 1

    candidates = [
        format(SIBLING_NAME_PATTERN, base, current_v + i)
        for i in 1 .. SIBLING_PROBE_DEPTH
    ]

    # Probe in parallel using HEAD requests — never download payloads.
    # Use SIBLING_PARALLELISM workers; cap total time at 5 seconds.
    results = parallel_head(candidates, workers=SIBLING_PARALLELISM, timeout=5s)

    # Take the HIGHEST-numbered repo that responded 200.
    # Skip 404s. Treat 5xx / timeouts as "unknown" — do not retry.
    highest = max(r for r in results if r.status == 200, key=version)
    return highest    # or null if none found
```

### 4.3 Mandatory constraints

1. Probes MUST be `HEAD` requests (or equivalent metadata calls), never full clones.
2. Probes MUST run in parallel, capped by `SIBLING_PARALLELISM`.
3. The total probe phase MUST have a wall-clock timeout (recommend 5 s) so a slow host never blocks install.
4. A 404 is a **definitive negative** for that sibling. Do not retry.
5. A network error is **inconclusive** — log it and skip that candidate. Do not retry.
6. Sibling discovery MUST NOT run in strict mode.
7. The installer MUST print which sibling (if any) was selected, and offer the user a way to opt out for next time (e.g. `--no-sibling-discovery`).

### 4.4 Naming-pattern ambiguity

If the implementing project's repo names do not fit a single regex (mixed separators, irregular casing, branded suffixes), the project MUST publish its own `SIBLING_NAME_PATTERN` and casing rule. The generic algorithm does not guess.

---

## 5. Deferred-delete & canonical-artifact-naming contract

On Windows, an installer that overwrites its own running binary, an in-use DLL, or a file held by another process **MUST NOT** fail the install. It also MUST NOT delete the file behind the user's back without an audit trail. This section defines the cross-platform contract that both `install.sh` and `install.ps1` follow when a target path cannot be removed synchronously.

### 5.1 Activation conditions

Deferred delete is engaged **only** when **all** of the following hold:

1. The installer is performing a write that would replace an existing file.
2. The synchronous unlink/delete attempt failed with a "file in use" error class:
   - **Windows:** `ERROR_SHARING_VIOLATION` (32), `ERROR_LOCK_VIOLATION` (33), `ERROR_ACCESS_DENIED` (5) on a known-locked extension (`.exe`, `.dll`, `.sys`, `.ocx`).
   - **Linux/macOS:** `ETXTBSY` (26) only. All other `EBUSY`/`EACCES` errors MUST surface as exit 2.
3. Strict-mode pinning (§2.1) does NOT exempt this path — strict mode controls **which version** is installed, not **how** locked files are handled.

If any condition is false, the installer MUST fail fast with the original OS error and exit 2 — silent retries are forbidden (memory `no-retry-policy`).

### 5.2 Canonical artifact naming

When deferral is engaged, the locked file MUST be renamed in-place to a **canonical pending-delete name** so that:

- Operators can identify orphans during incident response without guessing.
- The next install run can recognize and skip its own pending artifacts.
- Anti-virus / EDR tooling can be allowlisted against a single, stable pattern.

The canonical pattern is:

```
.<original-basename>.delete-pending-marco-<unix-millis>-<6-hex>
```

Examples:

| Original | Canonical pending-delete name |
|----------|-------------------------------|
| `marco-runtime.exe` | `.marco-runtime.exe.delete-pending-marco-1735689600000-a1b2c3` |
| `inject.dll` | `.inject.dll.delete-pending-marco-1735689600000-d4e5f6` |

Rules:

1. The leading dot makes the file hidden on POSIX and visually demoted on Windows Explorer.
2. The literal segment `delete-pending-marco-` is the **discriminator**. Tooling MUST match on this exact substring.
3. The unix-millis timestamp is UTC. CI verifies against `^\..+\.delete-pending-marco-\d{13}-[0-9a-f]{6}$`.
4. The 6-hex suffix is from a CSPRNG and prevents same-millisecond collisions.
5. The rename MUST be atomic on the same volume. Cross-volume "rename" → exit 2.

### 5.3 Scheduling the deferred delete

After successful rename, the installer MUST schedule deletion at next OS opportunity:

- **Windows:** `MoveFileEx(canonical_name, NULL, MOVEFILE_DELAY_UNTIL_REBOOT)` — adds an entry to `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\PendingFileRenameOperations`. Read the registry back to verify; on failure, exit 2.
- **Linux/macOS:** `unlink(canonical_name)`. POSIX permits unlinking an open file; the inode is released when the last handle closes.

The installer MUST NOT use `schtasks`, cron, systemd timers, or any user-space scheduler — `MoveFileEx` and `unlink` are the only sanctioned mechanisms.

### 5.4 Self-recognition on next run

Every run MUST scan its install directory for files matching §5.2 **before** doing any work, and:

1. If the deferral timestamp is older than 24 hours **and** the file is no longer locked, attempt synchronous delete. Log success at info level.
2. If still locked, leave it in place — the OS will collect at next reboot.
3. NEVER treat a `delete-pending-marco-*` file as an installation artifact, dependency, or config source.

### 5.5 Exit-code interaction

| Failure | Exit code |
|---------|-----------|
| Rename to canonical name failed (cross-volume, etc.) | 2 |
| `MoveFileEx` returned 0 (Win32) | 2 |
| Registry write of `PendingFileRenameOperations` could not be verified | 2 |
| POSIX `unlink` of canonical name failed | 2 |
| Locked-file class outside §5.1 allowlist (e.g. `EACCES` on `.txt`) | 2 |

There is no "exit 0 with warning" — either the file is renamed and scheduled (success) or the install aborts (exit 2).

### 5.6 Test surface

| # | Scenario | Expected behavior |
|---|----------|-------------------|
| AC-15 | Windows, target `.exe` is locked | Renamed to canonical pattern, `MoveFileEx` called, registry verified, install proceeds |
| AC-16 | Linux, target file held with `ETXTBSY` | Renamed to canonical pattern, `unlink` called, install proceeds |
| AC-17 | Cross-volume rename attempted | Exit 2, no canonical file created |
| AC-18 | Stale `.foo.delete-pending-marco-*` (>24h, unlocked) at start | Synchronously deleted, info-logged, install proceeds |
| AC-19 | `EACCES` on regular `.txt` | Exit 2 (not in allowlist), no rename attempted |
| AC-20 | Canonical regex on Windows CI registry value | Matches `^\..+\.delete-pending-marco-\d{13}-[0-9a-f]{6}$` |

CI for AC-15/AC-20 lives in `.github/workflows/installer-tests.yml` (Windows job, real `MoveFileEx`).

---

## 6. Required CLI surface

Every installer MUST accept at least these flags (long form; short forms optional):

| Flag | Effect |
|------|--------|
| `--version <vX.Y.Z \| latest>` | Override resolution. `latest` forces a fresh API lookup. |
| `--no-sibling-discovery` | Disable §4 even if the project enables it. |
| `--no-deferred-delete` | Disable §5 — fail fast on any locked file. CI sanity only. |
| `--dry-run` | Resolve version, print plan, exit 0 without installing. |
| `--help` | Print usage, exit 0. |

Additional flags are project-specific.

---

## 7. Logging expectations

1. The first line MUST identify resolved version and mode (strict / discovery).
2. Every network call MUST be logged at info: method, URL, status, elapsed ms.
3. Every deferred-delete event MUST be logged at info: original path, canonical name, mechanism (`MoveFileEx`/`unlink`), verification result.
4. Failures MUST include: what was attempted, expected, why it failed, remediation hint. (See `mem://constraints/file-path-error-logging-code-red.md`.)
5. Secrets MUST NEVER appear in logs.
6. The final line MUST summarize: version, mode, deferred-delete count, elapsed time.

---

## 7.1 Checksum verification (release-asset integrity)

Every download MUST be verified against a SHA-256 digest published in the same release. This is the v0.2 hardening of §8 rule 2.

### 7.1.1 Publishing contract (release pipeline)

The release pipeline (e.g. `.github/workflows/release.yml`) MUST emit a single text file named **`checksums.txt`** alongside every other asset, in standard `sha256sum` format:

```
<lowercase-hex-64>  <asset-filename>
<lowercase-hex-64>  <asset-filename>
...
```

One line per asset. Both the legacy `<hex>  <name>` and the GNU "binary mode" `<hex>  *<name>` forms MUST be accepted by verifiers (parsers MUST tolerate the optional `*`).

### 7.1.2 Verification contract (installer)

Immediately after a successful download of the primary archive, every installer MUST:

1. Fetch `checksums.txt` from the same release-download base URL.
2. Locate the line whose filename column matches the downloaded asset (exact match, case-sensitive).
3. Compute the local SHA-256 of the downloaded file using the platform's standard tool — `sha256sum`, `shasum -a 256`, `openssl dgst -sha256`, or PowerShell `Get-FileHash -Algorithm SHA256` — case-insensitive comparison.
4. Compare the hex digests.

### 7.1.3 Outcomes (normative)

| Outcome | Action |
|---------|--------|
| **Match** | Log `Checksum verified (<asset>)`. Continue install. |
| **Mismatch** | Exit **6** (per §3). MUST NOT touch the install directory. Error MUST include expected hex, actual hex, and source URL. |
| **`checksums.txt` missing (404)** | Soft-warn and continue. (Back-compat: releases predating v0.2 hardening did not ship this file; gating on it would break legacy reinstalls.) |
| **`checksums.txt` does not list the asset** | Soft-warn and continue. Same back-compat reasoning. |
| **No SHA-256 tool available locally** | Soft-warn with a remediation hint (install `coreutils`, `perl`, or `openssl`) and continue. |

### 7.1.4 Mandatory constraints

1. The verification step MUST run BEFORE any extraction or write to the install directory.
2. On mismatch the installer MUST NOT retry the download — a mismatch is a definitive abort signal (no-retry policy, `mem://constraints/no-retry-policy`).
3. The expected and actual hex strings MUST appear in the user-facing error so the user can manually re-verify the published value.
4. The verification download MUST go over the same scheme as the asset (HTTPS in production).
5. Signing of `checksums.txt` (minisign / cosign) is an optional v0.3 enhancement — not required by this spec revision.

---

## 8. Security considerations

1. All downloads MUST go over HTTPS.
2. Checksum mismatch → exit 6. (See §7.1 for the full contract.)
3. Strict mode MUST NOT downgrade transport security on API failure.
4. The installer MUST NOT execute arbitrary main-branch code unless discovery mode explicitly fell through (and the user was told).
5. Sibling probes MUST NOT send credentials.
6. Canonical pending-delete files MUST inherit the original file's ACL — no privilege widening.


---

## 9. Acceptance criteria (testable)

| # | Scenario | Expected behavior |
|---|----------|-------------------|
| AC-1 | No flag, no URL hint, releases exist | Installs latest release, discovery banner |
| AC-2 | No flag, no URL hint, zero releases (`200 OK + {}` or `404`) | Falls through to main-branch tarball, `🌿` banner, exit 0 |
| AC-3 | No flag, run from `/releases/download/v1.2.3/install.sh` | Strict mode, installs v1.2.3, `🔒` banner |
| AC-4 | `--version v1.2.3`, artifact exists | Strict mode, installs v1.2.3 |
| AC-5 | `--version v1.2.3`, artifact 404 | Exit 4 with version + URL + hint |
| AC-6 | `--version garbage` | Exit 3 |
| AC-7 | `--version latest` | API lookup, installs newest |
| AC-8 | API unreachable, no `--version` | Exit 5 |
| AC-9 | Strict + API down | Succeeds (does not consult API) |
| AC-10 | Sibling discovery on, `myproject-v5` exists, current is `-v2` | Picks `-v5`'s latest |
| AC-11 | Sibling discovery on, all probes 404 | Falls through to current repo |
| AC-12 | `--no-sibling-discovery` | Skips §4 |
| AC-13 | Strict + sibling discovery on | Sibling discovery suppressed |
| AC-14 | `--dry-run --version v1.2.3` | Plan printed, exit 0, nothing installed |
| AC-15 – AC-20 | Deferred-delete & canonical-naming | See §5.6 |
| AC-21 | Happy-path install + matching checksums.txt | Install completes, "Checksum verified" line in output |
| AC-22 | Wrong checksum in checksums.txt | Exit 6, "Checksum MISMATCH" with expected + actual hex, install dir untouched |
| AC-23 | checksums.txt missing (404) | Soft-warn, install proceeds (back-compat with pre-v0.2 releases) |

---

## 10. Per-repository migration checklist

1. **Inventory** every install entry point.
2. **Audit each script** against §2 — record which features it currently supports (incl. deferred-delete §5).
3. **Unify on one resolver.** Factor `resolve_version()` into a single function per language.
4. **Add the strict-mode guard.** Test for AC-5.
5. **Add the deferred-delete handler** per §5. Tests for AC-15 through AC-20.
6. **Add the exit-code mapping** from §3.
7. **Add the CLI surface** from §6.
8. **(Optional) Wire sibling discovery.** Tests for AC-10/AC-11.
9. **Standardize banners and final summary** per §7.
10. **CI coverage** for applicable ACs. Use HTTP fixtures or local mock — never hit the live release host. Use the real Win32 kernel for AC-15/AC-20.
11. **Document** in the repo's `README` install section, link back to this spec.

---

## 11. Reference implementation notes

- **Bash:** `xargs -P` for parallel probes; `curl -fsSI` for HEAD; `mv` for canonical rename; `unlink` for §5.
- **PowerShell:** `Start-ThreadJob` (or `ForEach-Object -Parallel` on PS 7+); `Invoke-WebRequest -Method Head`; `[System.IO.File]::Move()` for canonical rename; `MoveFileEx` via P/Invoke for §5.
- **Python bootstrap:** `concurrent.futures.ThreadPoolExecutor` + `urllib.request`.
- **Node bootstrap:** `Promise.all` over `fetch(url, { method: 'HEAD' })`.

The choice of language is project-specific; the algorithm is not.

---

## 12. Cross-references

- `spec/14-update/00-overview.md` — Update system overview
- `spec/21-app/02-features/chrome-extension/03-powershell-installer.md` — Project-specific installer (must conform)
- `mem://features/release-installer` — In-repo implementation notes for `scripts/install.{ps1,sh}`
- `mem://constraints/file-path-error-logging-code-red.md` — Error-message quality bar referenced by §7
- `mem://constraints/no-retry-policy` — Backs the "no silent retries" rule in §5.1
- `.github/workflows/installer-tests.yml` — CI coverage for AC-15 through AC-20
- RFC 2119 — MUST / SHOULD / MAY semantics

---

## 13. Shared installer contract (cross-language source of truth)

To prevent drift between Bash and PowerShell installers, repositories
implementing this spec SHOULD ship a single machine-readable contract
file that both installers consume:

| File | Role |
|---|---|
| `scripts/installer-contract.json` | **Source of truth** — repo, semver regex, exit codes, flags, endpoint env vars, sibling-discovery defaults, checksum settings, AC-IDs. |
| `scripts/installer-constants.sh` | Auto-generated; sourced by `install.sh` when present beside it. |
| `scripts/installer-constants.ps1` | Auto-generated; dot-sourced by `install.ps1` when present beside it. |
| `scripts/generate-installer-constants.mjs` | Regenerator. Run via `npm run installer:contract:gen`. |
| `scripts/check-installer-contract.mjs` | CI drift detector. Verifies generated files in sync, every `exit N` is declared, every `--long` / `-Switch` flag is declared, default-repo strings agree across both installers. |

**Standalone-install resilience.** Both installers MUST keep working
when only the single installer file is present (curl-piped one-liners
download just `install.sh`). The constants file is therefore an
*opt-in enhancement* — when absent, in-script fallbacks (which equal
the contract values at the time the installer was published) take over.

**CI requirement.** `node scripts/check-installer-contract.mjs` MUST
run alongside the existing installer-test suites. Failure modes:
- Hand-edited generated file → regenerate with `installer:contract:gen`.
- New `exit N` added without contract entry → add it to `exitCodes`.
- New flag added to one installer only → add to `flags` and mirror in the other.
- Default repo edited in one installer only → drift is rejected.
