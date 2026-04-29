# 09 — Bulk Tags / Labels / Categories scope

**Date**: 2026-04-27
**Surface**: Keyword Events bulk context menu

## The ambiguity

User asked to "add labels and categories" in the same sentence as tags, but
earlier (msg 6951EAA2) explicitly chose **"All flat tags (no separate
category)"** when offered the choice between tag-only vs tag+category models.

Two interpretations:

### Option A — Strict adherence to prior decision
- Labels = tags (just renamed in copy)
- No separate Category field
- One bulk action: Add/Remove labels-or-tags

**Pros**: Honors the prior explicit choice, smallest surface area.
**Cons**: User clearly typed "categories" this time — feels ignored.

### Option B — Add Category as a single optional flat field (recommended)
- Tags = the existing flat list (unchanged)
- Labels = treated as a synonym of tags in UI copy, **same** underlying field
- Category = NEW, single optional string per event (like
  `Prompts.Category` in the existing SQLite bundle contract — proven model)
- Bulk actions: Add tags, Remove tags, **Set category**, **Clear category**

**Pros**: Matches the user's words now; mirrors the existing Prompts
denormalised single-category pattern; still avoids the rejected
many-to-many category-table design; SQLite export already emits one
`Category` text column for Prompts, so the keyword-events bundle can
mirror it 1:1.
**Cons**: Adds one new field to the runtime model.

### Option C — Full taxonomy (Tags table + Categories table + join tables)
- Normalised many-to-many

**Pros**: Maximally flexible.
**Cons**: User explicitly REJECTED this in 6951EAA2 ("All flat tags (no
separate category)"). Direct violation.

## Decision

**Option B**. Add `Category?: string` as a flat optional field on
`KeywordEvent`, mirroring the `Prompts.Category` precedent. Treat
"labels" as UI copy for tags. Both the in-memory model and the SQLite
export already accommodate this trivially (the export schema's
`Category TEXT` column already exists in spirit — added now).
