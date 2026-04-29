# Fundamentals — MV3 Invariants & Lifecycle

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Medium (intent captured, body pending)

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Intent

Define the non-negotiable rules every Chrome MV3 extension built from this blueprint must follow: layer boundaries, six-phase lifecycle, four storage tiers, hard invariants (single auth path, sequential fail-fast, file-path CODE-RED, unified version, no remote code, dark-theme default).

---

## Source material to distill (private — do NOT cite in final body)

`spec/21-app/01-fundamentals.md`, mem://architecture/extension-lifecycle, mem://architecture/data-storage-layers, mem://constraints/no-retry-policy, mem://constraints/file-path-error-logging-code-red

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
