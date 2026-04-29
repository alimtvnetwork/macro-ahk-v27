# CI/CD & Release

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Low

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Overview

Defines the validation script gauntlet that runs before every build, the single-version policy across manifest + constants + SDKs, the build pipeline, the release ZIP contract, and the quality-badges workflow.

---

## Files in this folder

| # | File | Description |
|---|------|-------------|
| 01 | [01-validation-scripts.md](./01-validation-scripts.md) | check-version-sync, check-manifest-permissions, check-csp, etc.
| 02 | [02-version-policy.md](./02-version-policy.md) | Single version across manifest + constants + each SDK
| 03 | [03-build-pipeline.md](./03-build-pipeline.md) | Build order, parallel vs sequential, artefact paths
| 04 | [04-release-zip-contract.md](./04-release-zip-contract.md) | Required files inside the zip, naming, max size
| 05 | [05-quality-badges.md](./05-quality-badges.md) | GitHub Actions quality-badges workflow

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Parent overview | `../00-overview.md` |
| Folder structure rules | `../../01-spec-authoring-guide/01-folder-structure.md` |
