# Memory: features/database-ui/management-overhaul
Updated: 2026-03-27

The database management UI (v1.73.0), accessible via the '🗄️ Database' entry in the ☰ hamburger menu, supports a multi-tab interface: Data (sidebar row counts, 25-row paginated grid), Schema (visual table builder with Load from DB, Import/Export JSON, per-column validation, and FK editor), and Raw JSON (bulk schema definitions and auto-migrations). The Data tab includes a persistent filter bar supporting both Exact (=) and Contains (≈/LIKE) matching, with a case-sensitivity toggle (Aa) that utilizes SQLite's COLLATE NOCASE for efficient searching. A Markdown documentation generator is included for LLM-compatible schema reference.

The Storage panel now has 4 sub-tabs: KV Store, Database, **Config (DB)** (inline ProjectConfig row editor with section grouping, per-row save, re-seed from source), and IndexedDB. The Schema tab supports "Load from DB" (populates builder from meta tables), JSON export (`marco-schema-export` format), and JSON import for cross-project schema sharing.
