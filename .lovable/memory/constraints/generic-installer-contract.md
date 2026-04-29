---
name: generic-installer-contract
description: All installer scripts must follow spec/14-update/01-generic-installer-behavior.md — strict on tag/URL, latest→main fallback otherwise, optional parallel sibling-repo discovery
type: constraint
---

# Memory: constraints/generic-installer-contract
Updated: 2026-04-22

## The rule

**Every** installation script in **every** repo (`install.*`, `quick-install.*`, `release-install.*`, feature-scoped variants) MUST conform to the generic installer behavior spec:

📄 **`spec/14-update/01-generic-installer-behavior.md`** — share this file with any AI to bootstrap a compliant installer in another repository.

## Non-negotiable behaviors

1. **Strict mode** (explicit `--version vX.Y.Z` **or** script downloaded from a release-asset URL): install **exactly** that version. **No fallback** to latest, main, or sibling repos. Missing artifact → exit 4 with version + URL + hint.
2. **Discovery mode** (no version, no URL hint): try `latest` release API → optional sibling-repo discovery → main branch. Releases beat main; main is last resort.
3. **Network failure in discovery mode** → exit 5. **Never** silently fall through to main when the user might have wanted a real release.
4. **Sibling discovery** (versioned-family repos like `myproject-v2`, `myproject-v3`) is **opt-in**, runs only in discovery mode, uses parallel HEAD probes (default depth 20, parallelism 8, 5 s wall-clock cap), and picks the highest-numbered 200-OK sibling.
5. Exit codes are fixed: 0 ok, 3 bad `--version`, 4 missing artifact (strict), 5 network/tooling, 6 invalid archive.
6. Required CLI: `--version`, `--no-sibling-discovery`, `--dry-run`, `--help`.

## Why

Without one shared contract, every project's installer answers "what do I install when no version is given?" differently — leading to surprise main-branch installs, silent version drift, and broken CI. Strict mode locks down release-pinned installs; discovery mode gives a predictable fallback ladder.

## How to apply

- New repo: copy the spec file into `spec/14-update/01-generic-installer-behavior.md`, implement against §2, validate against §8 acceptance criteria.
- Existing repo: walk through the §9 migration checklist, refactor to a single `resolve_version()`, add the strict-mode guard, add CI for the applicable ACs.
- This repo's current installers (`scripts/install.{ps1,sh}`) already implement most of this — see `mem://features/release-installer` for what's done and the open gaps.
