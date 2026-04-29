# 35 — Uppercase .md filename CI failure: rename target

**Original task:** "FIX — `Uppercase .md filenames found … all .md files
must be lowercase hyphen-case`: `./spec/31-macro-recorder/LlmGuide.md`
and `./.lovable/question-and-ambiguity/README.md`."

## Point of confusion

The CI guard at `.github/workflows/ci.yml:778-790` greps any `[A-Z]`
in the path of every `*.md`. Two questions before mass-renaming:

1. **Casing form for `LlmGuide.md`** — the convention is "lowercase
   hyphen-case", but `LlmGuide` is a CamelCase identifier with two
   capital chunks. Three plausible kebab forms:
   - `llmguide.md` (single token)
   - `llm-guide.md` (two tokens, each capital becomes a hyphen)
   - `llm_guide.md` (snake_case — rejected, rule says **hyphen**-case)
2. **`README.md` → `readme.md`** — GitHub renders both as the folder's
   landing page. The convention says lowercase, so `readme.md`. But
   does this affect tooling that hard-codes `README.md`?

## Decision

- **`LlmGuide.md` → `llm-guide.md`** (Option 2). Matches the
  hyphen-case rule literally and reads naturally. The `LlmGuide`
  *identifier* (referenced by `generateLlmGuide()` in
  `injection-handler.ts` + `ProjectDetailView.tsx`, the `LlmGuide`
  glossary entry, and the H1 inside the file) is **not** a filename
  and stays untouched — the CI rule only inspects file paths.
- **`README.md` → `readme.md`**. GitHub still renders it as the folder
  landing page (case-insensitive lookup). No tool in this repo
  hard-codes the uppercase form (verified via
  `rg "question-and-ambiguity/README"` — only one hit, in
  `.lovable/prompts/04-no-questions.md`, updated in this same patch).

## Updates applied

Filename references updated (NOT the prose `LlmGuide` identifier):

| File | Change |
|------|--------|
| `spec/31-macro-recorder/00-overview.md:74` | ``LlmGuide.md`` → ``llm-guide.md`` |
| `spec/31-macro-recorder/02-phases.md:34` | ``LlmGuide.md`` → ``llm-guide.md`` |
| `spec/31-macro-recorder/19-url-tabs-appearance-waits-conditions.md:375` | ``LlmGuide.md`` → ``llm-guide.md`` |
| `spec/31-macro-recorder/llm-guide.md` (self-reference, none in body) | n/a |
| `.lovable/prompts/04-no-questions.md:54,105` | `question-and-ambiguity/README.md` → `question-and-ambiguity/readme.md` |
| `.lovable/plan.md:186` | left unchanged — `LlmGuide cookbook` is prose, not a filename |

The H1 `# LlmGuide — Macro Recorder` inside `llm-guide.md` and the
`generateLlmGuide` symbol exports are intentionally preserved.

## Verification

Re-ran the exact CI guard locally:

```bash
find . -name '*.md' -not -path './node_modules/*' -not -path './.git/*' \
  -not -path './skipped/*' | grep '[A-Z]'
```

Returns no matches → guard prints `✅ All .md filenames are lowercase`.
