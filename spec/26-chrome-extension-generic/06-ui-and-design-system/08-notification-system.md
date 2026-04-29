# Notification System

**Version:** 1.0.0
**Updated:** 2026-04-24
**Status:** Placeholder — to be authored
**AI Confidence:** Low (placeholder)
**Ambiguity:** Medium (intent captured, body pending)

> *Generic blueprint — no project-specific identifiers. If you find one, file an issue.*

---

## Intent

Define the SDK-side notification API (info/warn/error/success), 5-second dedupe window, max 3 visible toasts, copy-to-clipboard diagnostic on errors, version banner during init. This is the single source of truth for all toasts across all per-project SDKs.

---

## Source material to distill (private — do NOT cite in final body)

`standalone-scripts/marco-sdk/src/notify.ts`, `spec/22-app-issues/86-…` (§2.1)

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
