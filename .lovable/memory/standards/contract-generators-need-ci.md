---
name: Contract generators need CI
description: Any "single source of truth" generator (JSON contract → multiple emitted files) must land with its drift-checker invoked in CI in the same PR
type: constraint
---
# Contract generators need CI

Whenever a new "single source of truth" generator is introduced — a JSON/YAML contract that gets compiled into two or more downstream files (e.g. `installer-contract.json` → `installer-constants.sh` + `installer-constants.ps1`) — the drift detector for that contract MUST be invoked from a CI workflow in the **same PR** that introduces the generator.

**Why**: 2026-04-24 — `check-installer-contract.mjs` shipped in v2.228.0, was correctly wired into `package.json` as `check:installer-contract`, but the CI step was deferred to a "follow-up." It sat unwired for an entire release cycle. Drift between `install.sh` and `install.ps1` (the exact bug the contract was designed to prevent) could have landed on `main` undetected. See `.lovable/cicd-issues/01-installer-contract-not-in-ci.md`.

**How to apply**:

1. The PR that adds `scripts/<thing>-contract.json` + `scripts/check-<thing>-contract.mjs` MUST also modify the relevant `.github/workflows/*.yml` to invoke the checker.
2. The CI step runs **before** any tests that depend on the generated files (fail-fast principle).
3. Path triggers in the workflow MUST include the contract JSON, the generator, the checker, and every emitted file — so an edit to any of them fires CI.
4. The checker should require zero `npm ci` setup when possible (Node built-ins only) so it runs immediately after checkout.

**Pre-merge audit grep**: for every `scripts/check-*-contract.mjs`, grep `.github/workflows/` for an invocation. Zero hits = the rule is violated.
