# Six-Phase Lifecycle

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Medium (intent captured, body pending)

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Intent

Document the six lifecycle phases: 1) Install + bootstrap (manifest load, SQLite init, builtin script self-heal), 2) Service-worker activation (message router, error broadcast subscribed), 3) Page injection (7-stage pipeline), 4) Auth readiness gate, 5) User interaction, 6) Teardown / recovery.

---

## Source material to distill (private — do NOT cite in final body)

mem://architecture/extension-lifecycle, `spec/21-app/01-fundamentals.md`

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
