# 43 — Read-Memory prompt references non-existent spec paths

**Logged:** session of "read memory" install
**Source:** user prompt v1.0 ("Read Memory")

## Ambiguity

Prompt v1.0 references several spec folders that do not match the actual repo layout:

| Prompt says | Actually exists |
|---|---|
| `.lovable/user-preferences` | NOT present (no such file) |
| `spec/12-consolidated-guidelines/` | `spec/17-consolidated-guidelines/` (stub, only `00-overview.md` + `99-consistency-report.md`) |
| "18 self-contained guideline documents" | 0 content files exist; module is a planned stub per `00-overview.md` |
| `spec/10-powershell-integration/` | `spec/11-powershell-integration/` |
| `spec/13-cicd-pipeline-workflows/` | `spec/12-cicd-pipeline-workflows/` |
| `spec/14-self-update-app-update/` | `spec/14-update/` |
| `spec/15-wp-plugin-how-to/` | NOT present |
| `spec/23-app-database/` | `spec/23-database/` |
| `spec/24-app-design-system-and-ui/` | NOT present (use `spec/07-design-system/` + `spec/21-app/`) |

## Options

- **A. Saved prompt as-is** with the user's literal v1.0 wording, ignoring drift. Pro: faithful to user. Con: future AIs follow broken paths.
- **B. (Chosen)** Saved prompt with paths corrected to current repo, and noted the original `12-` reference inline. Updated lookup table to actual folder numbers. Pro: actionable, no broken reads. Con: deviates from literal user text.
- **C. Refuse to save until user reconciles.** Pro: strict. Con: blocks the user's explicit instruction.

## Recommendation

**B** — applied. The user's intent (a working onboarding prompt) is served by paths that resolve. The drift is documented here so it can be reconciled when the user next touches the prompt or the spec reorg lands content into `17-consolidated-guidelines/`.

## Follow-ups for user

1. Should `spec/17-consolidated-guidelines/` actually be authored (currently empty stub), or should the prompt's Phase 2 be removed?
2. Is `.lovable/user-preferences` intentionally absent, or should it be created from `mem://~user`?
3. Confirm folder restructure: prompt asked "Restructure folder if not according to this" — current `.lovable/` already matches the canonical layout in `spec/01-spec-authoring-guide/07-memory-folder-guide.md`, so no restructure was performed.
