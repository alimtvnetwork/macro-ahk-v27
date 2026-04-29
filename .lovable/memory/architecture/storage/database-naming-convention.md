# Memory: architecture/storage/database-naming-convention
Updated: 2026-03-21

All database entities—including tables, columns, and indexes—strictly use PascalCase. Underscores are forbidden in both table names and column names. This convention is enforced in the primary SQLite schema (`src/background/db-schemas.ts`) and all handler SQL queries. A v4 schema migration (`migration-v4-sql.ts`) renames all legacy snake_case columns to PascalCase on extension update using `ALTER TABLE RENAME COLUMN`. The bundle format (`sqlite-bundle.ts`) uses PascalCase columns natively (v4+) with legacy snake_case fallback for importing older bundles.
