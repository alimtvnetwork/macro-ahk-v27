# Memory: architecture/project-scoped-database
Updated: 2026-03-23

Each project gets its own SQLite .db file (named by slug, e.g., `marco-dashboard.db`) managed via OPFS with chrome.storage.local fallback. The system is fully implemented with:

- **DB Manager** (`src/background/project-db-manager.ts`): Per-project lifecycle (init, get, flush, drop) with debounced dirty-tracking.
- **Query Builder** (`src/background/project-query-builder.ts`): Prisma-style API (`queryCreate`, `queryFindMany`, `queryFindUnique`, `queryUpdate`, `queryDelete`, `queryCount`) translating JS calls to parameterized SQL. Schema management via `ProjectSchema` meta-table (`createUserTable`, `dropUserTable`, `listUserTables`).
- **API Handler** (`src/background/handlers/project-api-handler.ts`): Routes `PROJECT_API` messages for CRUD (GET/POST/PUT/DELETE) and SCHEMA commands (createTable/dropTable/listTables).
- **Message Registry**: `PROJECT_API`, `PROJECT_DB_CREATE_TABLE`, `PROJECT_DB_DROP_TABLE`, `PROJECT_DB_LIST_TABLES` registered in `src/background/message-registry.ts`.
- **UI**: Storage tab with KV Store, Database, and IndexedDB sub-tabs. Database panel supports table creation with typed columns and table deletion.
- **Developer Guide**: Docs section covers `db.<Table>.create/findMany/findUnique/update/delete/count` and `api.register/list`.
