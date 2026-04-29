# Generic Chrome Extension Blueprint

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Active (skeleton — body files are placeholders pending authoring)
**AI Confidence:** Production-Ready (intent) / Low (body)
**Ambiguity:** None

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Goal

An AI that reads only this folder must be able to scaffold, build, lint,
package, and ship a production-quality Chrome MV3 extension **without**
referring to any other project, codebase, or memory.

This folder is the **drop-in foundation** for any new Chrome extension.
It distills patterns proven in production: namespace systems, multi-tier
storage (SQLite + IndexedDB + chrome.storage + localStorage bridges),
service-worker lifecycle, message relay across three worlds, design
tokens, error management, auth bridging, CI validation, and packaging.

---

## Keywords

`chrome-extension` · `mv3` · `typescript` · `vite` · `sqlite` · `indexeddb` · `namespace` · `design-system` · `error-model` · `generic-blueprint`

---

## Scoring

| Metric | Value |
|--------|-------|
| AI Confidence | Production-Ready (intent), Low (body — placeholders) |
| Ambiguity | None |
| Health Score | 100/100 (skeleton) |

---

## File Inventory

| # | File / Folder | Description |
|---|---------------|-------------|
| 00 | `00-overview.md` | This file — index, scoring, goal statement |
| 01 | `01-fundamentals.md` | MV3 invariants, lifecycle, boundaries |
| 02 | `02-folder-and-build/` | Repository layout, tsconfig matrix, vite, manifest, packaging |
| 03 | `03-typescript-and-linter/` | Strict TS, ESLint flat-config, naming, zero-warnings policy |
| 04 | `04-architecture/` | Lifecycle, three-world model, message relay, namespace system, injection pipeline |
| 05 | `05-storage-layers/` | SQLite + IndexedDB + chrome.storage + localStorage tiers |
| 06 | `06-ui-and-design-system/` | Design tokens, dark-only theme, component library, controller UI, notifications |
| 07 | `07-error-management/` | AppError model, error code registry, file-path CODE-RED rule, logger |
| 08 | `08-auth-and-tokens/` | Bearer-token bridge, readiness gate, no-retry policy, host-permission failures |
| 09 | `09-injection-and-host-access/` | Permissions, restricted schemes, tab eligibility, cooldowns, token seeder |
| 10 | `10-testing-and-qa/` | Vitest, Playwright MV3, snapshot testing, non-regression rules |
| 11 | `11-cicd-and-release/` | Validation scripts, version policy, release ZIP contract |
| 12 | `12-templates/` | Copy-paste ready manifests, tsconfigs, vite/eslint configs, etc. |
| 13 | `13-ai-onboarding-prompt.md` | Single prompt + 10-step checklist for a fresh AI |
| 97 | `97-acceptance-criteria.md` | ~65 testable acceptance criteria |
| 98 | `98-changelog.md` | Version history |
| 99 | `99-consistency-report.md` | Structural health report |

---

## How to use this folder

1. Open `13-ai-onboarding-prompt.md` and follow the 10-step checklist.
2. Read sub-folders **in numeric order** — they are dependency-ordered.
3. Copy templates from `12-templates/` and replace tokens
   (`<PROJECT_NAME>`, `<ROOT_NAMESPACE>`, `<VERSION>`,
   `<HOST_MATCHES>`, `<EXTENSION_ID>`).
4. Validate by running every check listed in `11-cicd-and-release/`.
5. Verify zero warnings (`03-typescript-and-linter/05-zero-warnings-policy.md`).

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Spec authoring guide | `../01-spec-authoring-guide/00-overview.md` |
| Required files template | `../01-spec-authoring-guide/03-required-files.md` |
| TypeScript standards | `../02-coding-guidelines/02-typescript/00-overview.md` |
| Error management foundations | `../03-error-manage/00-overview.md` |
| Database conventions | `../04-database-conventions/00-overview.md` |
| Design system foundations | `../07-design-system/00-overview.md` |

---

## Generification policy

This folder MUST contain **zero** project-specific identifiers. Before
publishing any new content, run:

```bash
rg -i 'riseup|marco|lovable|supabase' spec/26-chrome-extension-generic/
```

The command MUST return zero hits (excluding this generification policy
note itself, which uses the names as forbidden examples).
