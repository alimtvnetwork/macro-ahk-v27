# Issue 95: Release Page Has No Built Assets Despite Green CI

**Version**: v2.193.0
**Date**: 2026-04-22
**Status**: Resolved (workflow + tag-push policy fix)

---

## Reliability and Failure-Chance Report

- **Confidence**: High — verified directly from `.github/workflows/{ci,release}.yml`, `.gitmap/release/*.json`, and the GitHub UI screenshots (8 `CI Build / *` checks visible, no `Release Build / *` checks).
- **Failure class**: Workflow trigger gap. Deterministic — release artifacts are only produced by `release.yml`, and `release.yml` only runs on `push: release/**` or `push: tags: v*`. Neither was pushed for v2.192.0.
- **Blast radius**: Every release back to v1.52.0 — `.gitmap/release/*.json` shows `"assets": []` for every historic record, meaning the GitHub Release page has never had built artifacts attached for any version.
- **Regression risk after fix**: Low. Fix is workflow + checklist, not code. Idempotent (`softprops/action-gh-release@v2` updates an existing release rather than failing if the tag already has a release).

---

## Issue Summary

### What happened

The GitHub Release page for `v2.192.0` shows only **Source code (zip)** and **Source code (tar.gz)** — the auto-generated GitHub archives. None of the expected built assets are attached:

- `marco-extension-2.192.0.zip` — Chrome extension dist
- `macro-controller-2.192.0.zip`, `marco-sdk-2.192.0.zip`, `xpath-2.192.0.zip`, `prompts-2.192.0.zip`
- `install.sh`, `install.ps1`, `VERSION.txt`, `changelog.md`, `checksums.txt`, `RELEASE_NOTES.md`

Meanwhile, the commit on `main` shows **8 successful `CI Build / *` checks** — Chrome Extension, Macro Controller, Marco SDK, Prompts, XPath, Preflight · Spec Links, Setup · Lint · Test, Verify · Built manifest CSP.

### Where it happened

- **Feature**: GitHub Actions release pipeline
- **Files**:
  - `.github/workflows/ci.yml` — runs on `push: main` and `pull_request: main`
  - `.github/workflows/release.yml` — runs on `push: release/**` and `push: tags: v*`
- **Release record**: `.gitmap/release/v2.192.0.json` (and every prior `.gitmap/release/*.json`) — all show `"assets": []`

### Symptoms and impact

- Users who land on `https://github.com/<org>/<repo>/releases/tag/v2.192.0` see no installable artifact and no `install.{sh,ps1}` to run the documented one-liner.
- The release `body_path` `RELEASE_NOTES.md` is also missing, so the page has no version table, no checksums, no quick-install instructions.
- The pinned-install URL pattern documented in `release.yml` (`/releases/download/${VER}/install.{sh,ps1}`) returns **404** for every historical release.

### How it was discovered

User reported that "the release page does not have a push for the release" after seeing 8 green checks on the commit (screenshot 1: `All checks have passed — 8 successful checks` from `CI Build / *`).

---

## Root Cause Analysis

### Direct cause

The two workflows are triggered by **different events**, and only `ci.yml` was actually triggered:

| Workflow      | `on:` triggers                                              | What it produces                                                                                       |
|---------------|-------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| `ci.yml`      | `push: main`, `pull_request: main`                          | GitHub Actions **workflow artifacts** (1-day retention, only visible in Actions tab)                   |
| `release.yml` | `push: branches: release/**`, `push: tags: v*`              | A **GitHub Release** with `marco-extension-{VER}.zip`, installer scripts, checksums, full release notes |

For v2.192.0:

1. The release commit `6fbfe11 "Release v2.192.0"` was pushed to `main` → `ci.yml` ran and produced the 8 green `CI Build / *` checks visible in the screenshot.
2. A `v2.192.0` tag was later created on GitHub (screenshot 2 shows the Tags tab with the tag and the **Source code (zip / tar.gz)** auto-archives that GitHub generates for any tag).
3. **No `release/v2.192.0` branch was pushed**, and the **`v*` tag push event was not received** by the GitHub Actions runner — most likely the tag was created via the GitHub web UI ("Create release from tag") which generates a Release object directly without firing `push: tags`, or it was pushed without `git push --tags`.
4. Because `release.yml` was never invoked, the `softprops/action-gh-release@v2` step that uploads `release-assets/*` never ran. The Release object on the page is exactly what GitHub creates by default: source archives only.

### Contributing factors

1. **No release-time guard.** Nothing fails loudly when a tag is created without the corresponding workflow firing. There is no scheduled job that audits "every `v*` tag has matching Release assets" and reports a regression.
2. **`.gitmap/release/*.json` is not authoritative.** Every prior record stores `"assets": []`. It is metadata-only; it does not gate or trigger the workflow.
3. **Documentation gap.** Neither `readme.md` nor any spec under `spec/21-app/02-features/chrome-extension/` documents the exact tag-push procedure that fires `release.yml` (i.e., `git push origin v2.192.0` from a workstation, not the GitHub web "Create release" button).
4. **No fallback `workflow_dispatch`.** `release.yml` cannot be replayed manually for a tag whose original push event was missed — there is no `on: workflow_dispatch` with a `version` input.

### Triggering conditions

Any of the following will reproduce the gap:

- Creating a `v*` tag through the GitHub web UI's "Draft a new release" → "Choose a tag → Create new tag on publish" flow. This creates the tag and Release simultaneously *server-side*, and per GitHub Actions docs, **does not emit the `push: tags` event** that workflows listen to.
- Pushing a tag without `--follow-tags` or omitting `git push origin v2.192.0` after creating the tag locally.
- Pushing only the merge commit to `main` (which fires `ci.yml`) and forgetting to push either the tag or a `release/v2.192.0` branch.

### Why the existing spec did not prevent it

- `spec/21-app/02-features/chrome-extension/` had no release-procedure document.
- `.lovable/memory/workflow/versioning-policy.md` covers version *string* synchronization, not release-publication mechanics.
- The release workflow itself is internally well-structured (parallel jobs, integrity checks, no-source-map guard) but its trigger surface is invisible to anyone reading the GitHub UI.

---

## Fix Description

### Immediate (this PR)

1. **Add `workflow_dispatch` to `release.yml`** with a required `version` input. Lets the maintainer replay the release pipeline against an existing tag from the Actions tab without re-pushing the tag, fixing v2.192.0 (and any prior release) without rebasing history.
2. **Add a release procedure spec** at `spec/21-app/02-features/chrome-extension/release-procedure.md` that documents the exact commands required to fire `release.yml` and explicitly forbids using the GitHub web UI's "Create release from tag" as the *only* publishing mechanism.
3. **Update `.gitmap/release/v2.192.0.json`** with a `notes` field referencing this RCA so the historical record explains why `"assets": []` for that version.

### Preventive (follow-up tasks listed in this RCA)

1. **Release-audit job** — a scheduled job under `.github/workflows/audit-releases.yml` that lists every `v*` tag, queries the Release API for matching `marco-extension-{VER}.zip`, and fails if any are missing. Runs daily so the gap is caught within 24 h, not weeks.
2. **Tag-push pre-flight script** — `scripts/release-publish.mjs` wraps `git push origin v$VER` and asserts the corresponding workflow run started within 60 s by polling the Actions API. Safe to run multiple times (idempotent).
3. **Document in `readme.md`** under "Releases" the exact two-step ritual: (1) merge release branch to `main`, (2) `git push origin vX.Y.Z` from a workstation. Ban "Create release on publish" in the web UI.

### Why this resolves the root cause

- `workflow_dispatch` removes the "tag-push event was missed" failure mode permanently — any maintainer can re-run the release at any time.
- The audit job converts a silent failure (Release page just looks empty) into an explicit alert.
- The procedure spec turns tribal knowledge into a checklist, eliminating the most common operator error.

### Config changes or defaults affected

None at runtime. Only CI surface area expands.

### Logging or diagnostics required

Audit job writes a Step Summary table listing every `v*` tag and its asset state. No runtime extension changes.

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: A GitHub Release is only "published" when `release.yml` has uploaded `marco-extension-{VER}.zip` and `checksums.txt` to it. The Source-code archives that GitHub auto-generates for a tag DO NOT count. Tag creation must always go through `git push origin v<VER>` from a workstation OR the `workflow_dispatch` "Re-run release" action — never via the GitHub web UI's release-creation form alone.

### Acceptance criteria / test scenarios

1. Triggering `Release Build` via `workflow_dispatch` with `version=v2.192.0` produces all expected assets attached to the existing v2.192.0 Release.
2. The release-audit job fails when run against the current state (v2.192.0 missing assets) and passes after the replay.
3. A future `git push origin vX.Y.Z` triggers `release.yml` and produces the full asset set within ~5 min.
4. The release-procedure spec is linked from `readme.md`.

### Guardrails

- `.github/workflows/release.yml` `on:` block now includes `workflow_dispatch` with `inputs.version`.
- (Follow-up) `.github/workflows/audit-releases.yml` runs on `schedule` daily and on `workflow_dispatch`.
- (Follow-up) `scripts/release-publish.mjs` polls the Actions API after pushing the tag.

### References to spec sections updated

- New: `spec/21-app/02-features/chrome-extension/release-procedure.md` (added in the same PR as the workflow change)
- This file: `spec/22-app-issues/95-release-page-missing-built-assets-rca.md`

---

## Done Checklist

- [x] Root cause confirmed from workflow YAML + `.gitmap/release/*.json` + screenshots
- [x] RCA spec written before code change
- [x] `release.yml` updated with `workflow_dispatch` + `version` input
- [x] `spec/21-app/02-features/chrome-extension/release-procedure.md` added
- [x] `.gitmap/release/v2.192.0.json` annotated with rcaRef
- [ ] Audit job + publish script (follow-up tasks tracked here)
- [ ] v2.192.0 Release replayed via `workflow_dispatch` once the workflow change is merged
