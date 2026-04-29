# MV3 Manifest

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Medium (intent captured, body pending)

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Intent

Provide the canonical manifest.json template with placeholders. Document the permission decision tree: which permissions to request, when to use optional_host_permissions vs matches[], CSP rules, web_accessible_resources policy, action vs sidePanel, host_permissions vs activeTab.

---

## Source material to distill (private — do NOT cite in final body)

`manifest.json`, `scripts/check-built-manifest-csp.mjs`, `scripts/check-manifest-permissions.mjs`

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
