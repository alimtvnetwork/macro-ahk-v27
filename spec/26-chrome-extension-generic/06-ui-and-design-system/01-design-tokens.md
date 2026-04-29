# Design Tokens

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Medium (intent captured, body pending)

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Intent

Define the HSL semantic token system in index.css (--background, --foreground, --primary, --primary-foreground, --secondary, --muted, --accent, --destructive, --border, --ring) and the matching tailwind.config.ts mapping. Rule: components NEVER use raw colors.

---

## Source material to distill (private — do NOT cite in final body)

`src/index.css`, `tailwind.config.ts`, `spec/07-design-system/02-theme-variable-architecture.md`

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
