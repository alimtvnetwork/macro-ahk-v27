# Memory: architecture/schema-meta-engine
Updated: 2026-03-27

The project implements a JSON-driven schema meta engine (`src/background/schema-meta-engine.ts`) for project-scoped SQLite databases. Three per-project meta tables store schema metadata:
- **MetaTables**: table-level info (name, description, system flag)
- **MetaColumns**: column definitions with type, nullable, default, unique, validation rules (JSON), and sort order
- **MetaRelations**: FK relationships with ON DELETE/UPDATE cascade options

A `JsonSchemaDef` format defines tables via JSON with `tables[]`, each containing `Columns[]` and `Relations[]`. The `applyJsonSchema()` migration engine creates missing tables, adds missing columns (additive-only), and upserts all metadata. It's idempotent and transactional.

Two doc generators produce AI-feedable schema references:
- `generateMarkdownDocs()`: table/column/relation markdown with validation rules
- `generatePrismaSchema()`: Prisma-style `.prisma` syntax (reference only, not used by Prisma ORM)

The meta tables are auto-created alongside `ProjectSchema` on project DB init. The existing `createUserTable()` in the query builder also registers in MetaTables/MetaColumns for backwards compatibility.
