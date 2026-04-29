# 17 — Error-swallowing audit UI: data source & route

## Context
User asked: "Add a dedicated UI page to view the error-swallowing audit
results (P0/P1/P2 lists) and link each item to its file and line."

No such audit currently exists in the repo:
- No script under `scripts/` produces an error-swallow report.
- No JSON/MD artifact under `.lovable/reports/` matches.
- No existing P0/P1/P2 classification anywhere.
- The "Namespace Logging" core rule (use `Logger.error()`, never bare
  `log()` for errors) is the closest spec, but no scanner enforces it.

## Options

### A. Build the audit script first, then the UI (full pipeline)
- Pros: real data, end-to-end useful, matches Code-Red/error-logging
  standards already in memory.
- Cons: large scope (script + classification rules + JSON schema + UI);
  far beyond a single UI task; affects business logic / build pipeline.

### B. Build only the UI page against a JSON contract
- Read `.lovable/reports/error-swallow-audit.json` (does not yet exist)
  with shape `{ generatedAt, items: [{ id, severity: "P0"|"P1"|"P2",
  file, line, snippet, rule, message }] }`.
- Page lists items grouped by severity; each row links to
  `vscode://file/<absPath>:<line>` and shows a relative-path label.
- If the JSON is missing, render an empty-state explaining how to
  generate it (deferred script).
- Pros: pure presentation work — matches the user's "UI page" wording
  and the "keep work in frontend/presentation" rule. Future-proof; the
  scanner can land later without UI churn.
- Cons: page shows empty state until the audit script exists.

### C. Embed a hand-curated static list in the page
- Pros: shows real items immediately.
- Cons: stale the moment code changes; duplicates source-of-truth into
  presentation; violates the Suggestions/Planning convention.

## Recommendation
**Option B.** The user explicitly asked for a "UI page" — that is
presentation work. The scanner is a separate, larger workstream that
should be tracked in `plan.md`, not bundled into a UI request. The page
will consume a documented JSON contract and degrade gracefully to a
clear empty state with generation instructions until the scanner
exists.

## Decision
Proceeding with Option B. Will:
1. Add `src/options/sections/ErrorSwallowAuditSection.tsx`.
2. Wire it into the existing options router as a new section.
3. Document the expected JSON contract in the page's empty state.
4. Add a follow-up bullet to `plan.md` for the scanner script.
