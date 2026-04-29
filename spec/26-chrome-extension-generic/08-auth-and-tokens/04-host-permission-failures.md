# Host Permission Failures

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Medium (intent captured, body pending)

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Intent

Document the canonical recovery for chrome.scripting.executeScript failures: 'Cannot access contents of the page. Extension manifest must request permission to access the respective host.' Cover detection, error categorisation (host-permission vs scripting-blocked vs restricted-scheme), cooldown, and UI surfacing.

---

## Source material to distill (private — do NOT cite in final body)

`src/background/handlers/token-seeder.ts`, `src/components/options/TokenSeederStatusIndicator.tsx`

---

## Required sections (when authored)

1. Concept summary (≤ 3 paragraphs).
2. Reference diagram or table.
3. Interface / signature / config snippets (TypeScript only).
4. Reference implementation excerpt (≤ 30 lines).
5. Common pitfalls table.
6. `DO` / `DO NOT` / `VERIFY` checklist.

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Folder structure rules | `../../01-spec-authoring-guide/01-folder-structure.md` |
| Required files | `../../01-spec-authoring-guide/03-required-files.md` |
