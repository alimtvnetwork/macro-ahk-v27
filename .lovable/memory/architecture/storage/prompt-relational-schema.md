# Memory: architecture/storage/prompt-relational-schema
Updated: 2026-03-21

Prompts use a normalized relational schema with three tables: `Prompts`, `PromptsCategory`, and `PromptsToCategory` (junction). Categories are auto-created on prompt insertion via `ensureCategoryId()`. All join-based reads use the `PromptsDetails` SQLite view (GROUP_CONCAT for category names). Default prompts are seeded into the Prompts table on first load (not served from memory), ensuring the storage browser always shows populated data. The storage browser UI separates tables and views into distinct sections, with views marked read-only.
