# Read Memory — AI Onboarding Sequence

**Version:** 1.0
**Trigger phrase:** "read memory"

> Mandatory onboarding sequence for any AI assistant joining this project. Ensures all specs, rules, and conventions are internalized before writing code.

> **Rule #0:** Follow every phase sequentially. Do not skip, summarize prematurely, or assume knowledge from training data. The specs are the single source of truth.

---

## Phase 1 — AI Context Layer

Read in EXACT order:

| Order | File | What You Learn |
|-------|------|----------------|
| 1 | `.lovable/overview.md` | Project summary, tech stack, navigation map |
| 2 | `.lovable/strictly-avoid.md` | Hard prohibitions — violating ANY is a critical failure |
| 3 | `.lovable/user-preferences` | How the human expects you to communicate |
| 4 | `.lovable/memory/index.md` | Index of all institutional knowledge files |
| 5 | `.lovable/plan.md` | Current active roadmap and priorities |
| 6 | `.lovable/suggestions.md` | Pending improvement ideas |

Then read EVERY file referenced in `.lovable/memory/index.md` (recursively). If a file is missing or empty, note it — do not silently skip.

### Self-check
- CODE RED rules?
- Naming conventions (files, folders, DB columns, variables)?
- Error handling philosophy?
- Current plan and in-progress tasks?
- Strictly forbidden patterns/tools?

---

## Phase 2 — Consolidated Guidelines

Read `spec/17-consolidated-guidelines/` in numeric order. (Note: prompt v1.0 originally referenced `spec/12-consolidated-guidelines/` — actual location is `17-`. See ambiguity log `43-read-memory-prompt-spec-paths.md`.)

---

## Phase 3 — Spec Authoring Rules

Read all files in `spec/01-spec-authoring-guide/` in numeric order.

After reading, confirm understanding of:
- File and folder naming conventions
- Required files in every spec folder (`00-overview.md`, `99-consistency-report.md`)
- `.lovable/` folder structure (`07-memory-folder-guide.md`)
- Linter infrastructure requirements

---

## Phase 4 — Deep-Dive Source Specs (Task-Driven)

Before any task, read the relevant spec(s):

| Task involves... | Spec folder |
|---|---|
| Writing/reviewing code | `spec/02-coding-guidelines/` |
| Error handling | `spec/03-error-manage/` |
| Database schema/queries | `spec/04-database-conventions/` |
| SQLite / multi-DB | `spec/05-split-db-architecture/` |
| Configuration systems | `spec/06-seedable-config-architecture/` |
| UI theming, design tokens | `spec/07-design-system/` |
| Documentation viewer | `spec/08-docs-viewer-ui/` |
| Code block rendering | `spec/09-code-block-system/` |
| PowerShell scripts | `spec/11-powershell-integration/` |
| CI/CD pipelines | `spec/12-cicd-pipeline-workflows/` |
| Self-update | `spec/14-update/` |
| App-specific features | `spec/21-app/` |
| Known app bugs | `spec/22-app-issues/` |
| App-specific database | `spec/23-database/` |

Reading order in each: `00-overview.md` → numbered files → `99-consistency-report.md`.

---

## Phase 5 — CI/CD Issues Review

Read every `.lovable/cicd-issues/xx-*.md` and the `.lovable/cicd-index.md`. Do not repeat these mistakes.

---

## Anti-Hallucination Contract

1. **Never invent rules.** If a spec doesn't mention it, it doesn't exist.
2. **Specs override training data.** Always.
3. **Cite sources.** Reference file + section.
4. **Ask when uncertain.** Unless No-Questions Mode is active — then log to `.lovable/question-and-ambiguity/`.
5. **Never merge conventions** from other projects.
6. **No filler.** Skip "let me know if…" / "hope this helps!".

---

## Memory Update Protocol

```
New info?
├─ Institutional (pattern/convention/decision) → write to `.lovable/memory/<subfolder>/` + update `.lovable/memory/index.md`
├─ Must NEVER be done                          → add to `.lovable/strictly-avoid.md`
├─ Suggestion not yet approved                 → add to `.lovable/suggestions.md`
└─ None of the above                           → don't persist
```

- Memory folder is `.lovable/memory/` — NEVER `.lovable/memories/`.
- New memory file ⇒ ALWAYS update the index.
- Modifying memory ⇒ preserve all unrelated entries.

---

## Code-Change Rule

**Any change to code base always bumps the minor version** across: `chrome-extension/manifest.json`, `src/shared/constants.ts`, every `standalone-scripts/*/src/instruction.ts`, `macro-controller/src/shared-state.ts`, and SDK `index.ts` literal. See `mem://workflow/versioning-policy`.

(Pure-doc changes under `.lovable/` do not require a bump.)

---

## Completion Confirmation

After Phases 1–3, respond exactly:

```
✅ Onboarding complete.
- Memory files read: [X]
- Consolidated guidelines read: [Y]
- Spec authoring files read: [Z]

I understand:
- CODE RED rules: [top 3–5]
- Naming conventions: [brief]
- Error handling: [one sentence]
- Active plan: [current focus]
- Strict avoidances: [top 3–5]

Ready for tasks.
```

Then **stop and wait**. Don't suggest next steps.

---

*Prompt v1.0. Update in sync with spec version changes.*
