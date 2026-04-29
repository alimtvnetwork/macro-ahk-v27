---
name: No static / placeholder badges in root README
description: Forbids static img.shields.io/badge/ mockup badges and all "activate" / "no status" / "not found" placeholders in readme.md hero
type: constraint
---

## Rule

The repository-root `readme.md` hero block (everything inside the top `<div align="center">…</div>`) **MUST NOT** contain any of the following:

1. **Static mockup badges** with URL pattern `https://img.shields.io/badge/<text>-<text>-<color>` — these are hand-encoded labels, not live data. Examples that have already been removed and must never come back: `Manifest-V3`, `TypeScript-5`, `Node-20+`, `pnpm-9`, `Vite-5`, `React-18`, `Tailwind-3`, `SQLite-sql.js`, `ESLint-SonarJS`, `tested%20with-Vitest`, `E2E-Playwright`, `License-Proprietary`, `Codacy-activate`, `Code%20Climate-activate`, `Codecov-activate`, `Renovate-ready`, `Dependabot-active`, `dependencies-audited`, `coverage-tracked`, `TypeScript-strict`, `maintained-yes`, `PRs-welcome`, `made%20with-♥`.
2. **Placeholder / fail-state badges** whose rendered text contains any of: `activate`, `no status`, `not found`, `repo not found`, `no releases found`, `404`, `badge not found`, `repo or branch not found`, `repo or workflow not found`. These appear visually crossed out in the GitHub render.
3. **Decorative badges** with no live state (`PRs-welcome`, `made-with-love`, hand-rolled "Maintained: yes", etc.).
4. **Stacked badge layout** where each `<!-- Group -->` marker sits on its own line with blank lines separating groups, producing 5+ visual rows of badges in the hero. The hero badge area MUST collapse to **1–2 visual lines** (one markdown paragraph, max two consecutive lines). See `spec/01-spec-authoring-guide/11-root-readme-conventions.md` §"Badge Layout Rules" for the grammar.

## Why

Static mockup badges lie about project state — they show "0 stars" with green styling, "TypeScript: 5" while the repo is on TypeScript 4, or "activate" forever because the OAuth onboarding never happened. They erode trust in the README and clutter the hero. The 2026-04-22 audit removed ~25 such badges from `readme.md`; the per-group minimums in `scripts/check-readme-compliance.mjs` were lowered (Build & Release ≥1, Repo activity ≥1, Community ≥0, Code-quality ≥1, Stack & standards ≥1, total ≥5) so the checker no longer pressures contributors to pad with placeholders.

## How to apply

- Before adding any badge, confirm its URL points to a **live-data shields.io endpoint** (e.g. `github/actions/workflow/status/...`, `github/issues/...`, `github/license/...`, `github/v/release/...`, `codefactor/grade/...`, `codecov/c/github/...`).
- If a category has no live-data badge available yet, **leave the group empty** with an explanatory HTML comment (`<!-- (intentionally empty — see mem://constraints/no-static-mockup-badges) -->`) under the group marker. Do not pad.
- When a service requires OAuth activation (Codacy, Code Climate, Codecov, Snyk), do **not** add an "activate" placeholder. Wait until the project UUID/token exists, then add the live badge.
- For stack-version badges (Node, TS, React, etc.), prefer `img.shields.io/github/package-json/dependency-version/<owner>/<repo>/<dep>` over hand-encoded `badge/<lib>-<ver>` URLs. If no live source exists, omit.
- The `## Author` and `## License` sections are unaffected — only the badge hero block is governed by this rule.

## Enforcement

- `scripts/check-readme-compliance.mjs` enforces the new per-group floors and the ≥5 aggregate.
- The badge-link audit (when run) flags any URL matching `img.shields.io/badge/` inside the hero block as a violation.
- Spec authority: `spec/01-spec-authoring-guide/11-root-readme-conventions.md` §"Forbidden Badge Patterns".
- Read/write procedure: `spec/01-spec-authoring-guide/12-root-readme-read-write-spec.md`.
