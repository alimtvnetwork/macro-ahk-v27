# Prompt Pipeline (Authoring → Distribution)

**Status**: 2026-04-24. Spec at `spec/30-import-export/`.

## Authoring layout

```
standalone-scripts/prompts/<NN-slug>/
  ├─ info.json   PascalCase keys (Id, Title, Slug, Version, Author, Categories, IsDefault, Order, CreatedAt, UpdatedAt)
  └─ prompt.md   raw markdown text (canonical bytes)
```

PascalCase `info.json` migration completed 2026-04-24 across all 14 prompt folders. The aggregator (`scripts/aggregate-prompts.mjs`) accepts PascalCase as canonical and emits a deprecation warning when legacy camelCase keys are encountered.

## Pipeline

1. **Source**: `prompts/<NN-slug>/{info.json, prompt.md}` (in `standalone-scripts/`).
2. **Aggregator**: `scripts/aggregate-prompts.mjs` reads each folder, calls `.trim()` on `prompt.md`, emits `chrome-extension/prompts/macro-prompts.json` (camelCase array — runtime contract).
3. **Runtime seed**: `src/background/handlers/prompt-handler.ts` inserts the aggregated JSON into the SQLite `Prompts` table (PascalCase columns).
4. **Export**: `src/lib/sqlite-bundle.ts` writes the `Prompts` table back into `marco-backup.db` inside the bundle zip.
5. **Resolver** (test contract): `resolvePromptBySlug(db, slug)` returns `Prompts.Text`. The byte-equality assertion is `Text === trimEnd(readFile(prompt.md))`.

## Drift / known issues

- Aggregator's `.trim()` ⇒ round-trip equality must use `trimEnd()` (right-trim only).
- `PromptsCategory` + `PromptsToCategory` junction tables are **not** included in the export. Multi-category prompts are flattened into the single `Prompts.Category` column. Restoration is lossy. Tracked in `plan.md`.

## Files of interest

- `scripts/aggregate-prompts.mjs` — aggregator (PascalCase reader as of 2026-04-24).
- `src/background/handlers/prompt-handler.ts` — runtime seeder + DDL.
- `src/lib/sqlite-bundle.ts` — export/import.
- `src/hooks/use-prompts.ts` — `PromptEntry` TS type.
