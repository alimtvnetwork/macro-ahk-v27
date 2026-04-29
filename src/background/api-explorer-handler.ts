/**
 * Marco Extension — API Explorer Handler
 *
 * Provides Swagger-like metadata for message endpoints plus
 * a lightweight API status summary for in-extension testing.
 */

/* eslint-disable sonarjs/no-duplicate-string -- endpoint metadata has naturally repeated category strings */

import { MessageType } from "../shared/messages";
import { buildStatusResponse } from "./status-handler";
import { buildHealthResponse } from "./health-handler";

type EndpointDoc = {
    type: MessageType;
    displayName: string;
    category: string;
    description: string;
    isMutating: boolean;
    exampleRequest: Record<string, unknown>;
};

type EndpointOverride = {
    category: string;
    description: string;
    exampleRequest?: Record<string, unknown>;
};

const ENDPOINT_OVERRIDES: Partial<Record<MessageType, EndpointOverride>> = {
    [MessageType.GET_STATUS]: {
        category: "Health & Recovery",
        description: "Returns aggregated extension runtime status (connection, auth token state, boot timings).",
        exampleRequest: { type: MessageType.GET_STATUS },
    },
    [MessageType.GET_HEALTH_STATUS]: {
        category: "Health & Recovery",
        description: "Returns health state machine output (HEALTHY/DEGRADED/ERROR/FATAL + details).",
        exampleRequest: { type: MessageType.GET_HEALTH_STATUS },
    },
    [MessageType.GET_AUTH_HEALTH]: {
        category: "Health & Recovery",
        description: "Runs the full auth strategy waterfall with per-strategy timing, reporting which strategies succeeded/failed.",
        exampleRequest: { type: MessageType.GET_AUTH_HEALTH },
    },
    [MessageType.GET_API_STATUS]: {
        category: "API Explorer",
        description: "Returns API explorer health summary and endpoint count.",
        exampleRequest: { type: MessageType.GET_API_STATUS },
    },
    [MessageType.GET_API_ENDPOINTS]: {
        category: "API Explorer",
        description: "Returns all registered message endpoint docs for Swagger-like browsing/testing.",
        exampleRequest: { type: MessageType.GET_API_ENDPOINTS },
    },
    [MessageType.SAVE_PROMPT]: {
        category: "Prompts",
        description: "Creates or updates a prompt in SQLite prompt tables.",
        exampleRequest: {
            type: MessageType.SAVE_PROMPT,
            prompt: { name: "My Prompt", text: "Prompt content", category: "general" },
        },
    },
    [MessageType.KV_SET]: {
        category: "Project KV",
        description: "Sets a project-scoped key/value entry.",
        exampleRequest: {
            type: MessageType.KV_SET,
            projectId: "_global",
            key: "example_key",
            value: "example_value",
        },
    },
    [MessageType.GKV_SET]: {
        category: "Grouped KV",
        description: "Sets a grouped key/value entry for global categorized metadata.",
        exampleRequest: {
            type: MessageType.GKV_SET,
            group: "rename_forbidden",
            key: "workspace_id",
            value: "{\"message\":\"forbidden\"}",
        },
    },
    [MessageType.STORAGE_QUERY_TABLE]: {
        category: "Storage Browser",
        description: "Queries a table with pagination for Storage Browser UI.",
        exampleRequest: {
            type: MessageType.STORAGE_QUERY_TABLE,
            table: "Prompts",
            offset: 0,
            limit: 25,
        },
    },
    [MessageType.STORAGE_SESSION_LIST]: {
        category: "Storage Browser",
        description: "Lists chrome.storage.session entries for inspection and export.",
        exampleRequest: { type: MessageType.STORAGE_SESSION_LIST, prefix: "marco_" },
    },
    [MessageType.STORAGE_COOKIES_LIST]: {
        category: "Storage Browser",
        description: "Lists browser cookies (filtered by domain/name when provided).",
        exampleRequest: { type: MessageType.STORAGE_COOKIES_LIST, domain: "lovable.dev" },
    },
    [MessageType.GET_OPTIONS_BOOTSTRAP]: {
        category: "Scripts & Configs",
        description: "Returns all projects, scripts, and configs in a single round-trip for Options page bootstrap.",
        exampleRequest: { type: MessageType.GET_OPTIONS_BOOTSTRAP },
    },
    [MessageType.RESEED_PROMPTS]: {
        category: "Prompts",
        description: "Re-seeds the default prompt catalog from the built-in template set.",
        exampleRequest: { type: MessageType.RESEED_PROMPTS },
    },
    [MessageType.AUTH_GET_TOKEN]: {
        category: "Marco SDK",
        description: "Returns the current auth token for SDK consumers.",
        exampleRequest: { type: MessageType.AUTH_GET_TOKEN },
    },
    [MessageType.AUTH_GET_SOURCE]: {
        category: "Marco SDK",
        description: "Returns the source that provided the current auth token (cookie, localStorage, extension).",
        exampleRequest: { type: MessageType.AUTH_GET_SOURCE },
    },
    [MessageType.AUTH_REFRESH]: {
        category: "Marco SDK",
        description: "Forces a token refresh through the auth waterfall.",
        exampleRequest: { type: MessageType.AUTH_REFRESH },
    },
    [MessageType.AUTH_IS_EXPIRED]: {
        category: "Marco SDK",
        description: "Checks whether the current auth token is expired.",
        exampleRequest: { type: MessageType.AUTH_IS_EXPIRED },
    },
    [MessageType.AUTH_GET_JWT]: {
        category: "Marco SDK",
        description: "Returns the decoded JWT payload of the current token.",
        exampleRequest: { type: MessageType.AUTH_GET_JWT },
    },
    [MessageType.COOKIES_GET]: {
        category: "Marco SDK",
        description: "Gets a single cookie value by name.",
        exampleRequest: { type: MessageType.COOKIES_GET, name: "sb-access-token" },
    },
    [MessageType.COOKIES_GET_DETAIL]: {
        category: "Marco SDK",
        description: "Gets detailed cookie metadata (domain, path, expiry, etc.).",
        exampleRequest: { type: MessageType.COOKIES_GET_DETAIL, name: "sb-access-token" },
    },
    [MessageType.COOKIES_GET_ALL]: {
        category: "Marco SDK",
        description: "Gets all cookies for the current domain context.",
        exampleRequest: { type: MessageType.COOKIES_GET_ALL },
    },
    [MessageType.CONFIG_GET]: {
        category: "Marco SDK",
        description: "Gets a single config value by key.",
        exampleRequest: { type: MessageType.CONFIG_GET, key: "loopInterval" },
    },
    [MessageType.CONFIG_GET_ALL]: {
        category: "Marco SDK",
        description: "Gets all config key-value pairs.",
        exampleRequest: { type: MessageType.CONFIG_GET_ALL },
    },
    [MessageType.CONFIG_SET]: {
        category: "Marco SDK",
        description: "Sets a config key-value pair at runtime.",
        exampleRequest: { type: MessageType.CONFIG_SET, key: "loopInterval", value: 100 },
    },
    [MessageType.XPATH_GET]: {
        category: "Marco SDK",
        description: "Evaluates an XPath expression and returns matched elements.",
        exampleRequest: { type: MessageType.XPATH_GET, xpath: "//button[@data-testid='send']" },
    },
    [MessageType.XPATH_GET_ALL]: {
        category: "Marco SDK",
        description: "Returns all registered XPath definitions.",
        exampleRequest: { type: MessageType.XPATH_GET_ALL },
    },
    [MessageType.FILE_READ]: {
        category: "Marco SDK",
        description: "Reads a file from project file storage.",
        exampleRequest: { type: MessageType.FILE_READ, path: "config.json" },
    },
    [MessageType.LIST_UPDATERS]: {
        category: "Updater",
        description: "Lists all configured script updaters with status and version info.",
        exampleRequest: { type: MessageType.LIST_UPDATERS },
    },
    [MessageType.GET_UPDATER]: {
        category: "Updater",
        description: "Gets a single updater definition by ID.",
        exampleRequest: { type: MessageType.GET_UPDATER, id: "macro-controller" },
    },
    [MessageType.CREATE_UPDATER]: {
        category: "Updater",
        description: "Creates or updates a script updater configuration.",
        exampleRequest: { type: MessageType.CREATE_UPDATER, id: "macro-controller", url: "https://example.com/script.js" },
    },
    [MessageType.DELETE_UPDATER]: {
        category: "Updater",
        description: "Deletes a script updater by ID.",
        exampleRequest: { type: MessageType.DELETE_UPDATER, id: "macro-controller" },
    },
    [MessageType.CHECK_FOR_UPDATE]: {
        category: "Updater",
        description: "Checks a specific updater for available updates.",
        exampleRequest: { type: MessageType.CHECK_FOR_UPDATE, id: "macro-controller" },
    },
    [MessageType.GET_UPDATE_SETTINGS]: {
        category: "Updater",
        description: "Gets global auto-update settings.",
        exampleRequest: { type: MessageType.GET_UPDATE_SETTINGS },
    },
    [MessageType.SAVE_UPDATE_SETTINGS]: {
        category: "Updater",
        description: "Saves global auto-update settings.",
        exampleRequest: { type: MessageType.SAVE_UPDATE_SETTINGS, autoCheck: true, intervalMs: 3600000 },
    },
    [MessageType.PROJECT_API]: {
        category: "Project Database",
        description: "Generic project database API dispatcher for CRUD operations.",
        exampleRequest: { type: MessageType.PROJECT_API, action: "query", table: "tasks", where: {} },
    },
    [MessageType.PROJECT_DB_CREATE_TABLE]: {
        category: "Project Database",
        description: "Creates a new table in the project database from a column schema.",
        exampleRequest: { type: MessageType.PROJECT_DB_CREATE_TABLE, table: "tasks", columns: [{ name: "title", type: "TEXT" }] },
    },
    [MessageType.PROJECT_DB_DROP_TABLE]: {
        category: "Project Database",
        description: "Drops (deletes) a table from the project database.",
        exampleRequest: { type: MessageType.PROJECT_DB_DROP_TABLE, table: "tasks" },
    },
    [MessageType.PROJECT_DB_LIST_TABLES]: {
        category: "Project Database",
        description: "Lists all tables in the project database.",
        exampleRequest: { type: MessageType.PROJECT_DB_LIST_TABLES },
    },
    [MessageType.PROJECT_CONFIG_READ]: {
        category: "Project Config",
        description: "Reads the merged project config (defaults + overrides).",
        exampleRequest: { type: MessageType.PROJECT_CONFIG_READ },
    },
    [MessageType.PROJECT_CONFIG_UPDATE]: {
        category: "Project Config",
        description: "Updates specific project config fields.",
        exampleRequest: { type: MessageType.PROJECT_CONFIG_UPDATE, patch: { loopInterval: 120 } },
    },
    [MessageType.PROJECT_CONFIG_RECONSTRUCT]: {
        category: "Project Config",
        description: "Reconstructs the project config from defaults and stored overrides.",
        exampleRequest: { type: MessageType.PROJECT_CONFIG_RECONSTRUCT },
    },
    [MessageType.APPLY_JSON_SCHEMA]: {
        category: "Schema Engine",
        description: "Applies a JSON schema to validate or transform project data.",
        exampleRequest: { type: MessageType.APPLY_JSON_SCHEMA, schema: {}, data: {} },
    },
    [MessageType.GENERATE_SCHEMA_DOCS]: {
        category: "Schema Engine",
        description: "Generates human-readable documentation from a JSON schema.",
        exampleRequest: { type: MessageType.GENERATE_SCHEMA_DOCS, schema: {} },
    },
    [MessageType.GET_AUTOMATION_CHAINS]: {
        category: "Automation",
        description: "Lists all saved automation chains.",
        exampleRequest: { type: MessageType.GET_AUTOMATION_CHAINS },
    },
    [MessageType.SAVE_AUTOMATION_CHAIN]: {
        category: "Automation",
        description: "Creates or updates an automation chain definition.",
        exampleRequest: { type: MessageType.SAVE_AUTOMATION_CHAIN, chain: { id: "auto-1", name: "Example", steps: [] } },
    },
    [MessageType.DELETE_AUTOMATION_CHAIN]: {
        category: "Automation",
        description: "Deletes an automation chain by ID.",
        exampleRequest: { type: MessageType.DELETE_AUTOMATION_CHAIN, id: "auto-1" },
    },
    [MessageType.TOGGLE_AUTOMATION_CHAIN]: {
        category: "Automation",
        description: "Enables or disables an automation chain.",
        exampleRequest: { type: MessageType.TOGGLE_AUTOMATION_CHAIN, id: "auto-1", enabled: true },
    },
    [MessageType.IMPORT_AUTOMATION_CHAINS]: {
        category: "Automation",
        description: "Imports automation chains from a JSON payload.",
        exampleRequest: { type: MessageType.IMPORT_AUTOMATION_CHAINS, chains: [] },
    },
    [MessageType.GET_SCRIPT_INFO]: {
        category: "Hot Reload",
        description: "Returns metadata (version, hash, size) for an injected script.",
        exampleRequest: { type: MessageType.GET_SCRIPT_INFO, scriptId: "macro-controller" },
    },
    [MessageType.HOT_RELOAD_SCRIPT]: {
        category: "Hot Reload",
        description: "Re-injects a script into the active tab without full page reload.",
        exampleRequest: { type: MessageType.HOT_RELOAD_SCRIPT, scriptId: "macro-controller" },
    },
    [MessageType.INVALIDATE_CACHE]: {
        category: "Cache",
        description: "Invalidates cached data by key pattern or scope.",
        exampleRequest: { type: MessageType.INVALIDATE_CACHE, pattern: "*" },
    },
    [MessageType.GET_CACHE_STATS]: {
        category: "Cache",
        description: "Returns cache hit/miss statistics and memory usage.",
        exampleRequest: { type: MessageType.GET_CACHE_STATS },
    },
};

/** Maps internal SCREAMING_SNAKE enum values to human-friendly hyphen-case names. */
const DISPLAY_NAME_MAP: Partial<Record<MessageType, string>> = {
    [MessageType.GET_CONFIG]: "get-config",
    [MessageType.GET_TOKEN]: "get-token",
    [MessageType.REFRESH_TOKEN]: "refresh-token",
    [MessageType.LOG_ENTRY]: "log-entry",
    [MessageType.LOG_ERROR]: "log-error",
    [MessageType.GET_RECENT_LOGS]: "get-recent-logs",
    [MessageType.GET_LOG_STATS]: "get-log-stats",
    [MessageType.PURGE_LOGS]: "purge-logs",
    [MessageType.EXPORT_LOGS_JSON]: "export-logs-json",
    [MessageType.EXPORT_LOGS_ZIP]: "export-logs-zip",
    [MessageType.GET_ACTIVE_PROJECT]: "get-active-project",
    [MessageType.SET_ACTIVE_PROJECT]: "set-active-project",
    [MessageType.GET_ALL_PROJECTS]: "get-all-projects",
    [MessageType.SAVE_PROJECT]: "save-project",
    [MessageType.DELETE_PROJECT]: "delete-project",
    [MessageType.DUPLICATE_PROJECT]: "duplicate-project",
    [MessageType.IMPORT_PROJECT]: "import-project",
    [MessageType.EXPORT_PROJECT]: "export-project",
    [MessageType.GET_ALL_SCRIPTS]: "get-all-scripts",
    [MessageType.SAVE_SCRIPT]: "save-script",
    [MessageType.DELETE_SCRIPT]: "delete-script",
    [MessageType.TOGGLE_SCRIPT]: "toggle-script",
    [MessageType.GET_ALL_CONFIGS]: "get-all-configs",
    [MessageType.SAVE_CONFIG]: "save-config",
    [MessageType.DELETE_CONFIG]: "delete-config",
    [MessageType.GET_SCRIPT_CONFIG]: "get-script-config",
    [MessageType.GET_OPTIONS_BOOTSTRAP]: "get-options-bootstrap",
    [MessageType.INJECT_SCRIPTS]: "inject-scripts",
    [MessageType.INJECTION_RESULT]: "injection-result",
    [MessageType.GET_TAB_INJECTIONS]: "get-tab-injections",
    [MessageType.GET_STATUS]: "get-status",
    [MessageType.GET_HEALTH_STATUS]: "get-health-status",
    [MessageType.GET_AUTH_HEALTH]: "get-auth-health",
    [MessageType.GET_API_STATUS]: "get-api-status",
    [MessageType.GET_API_ENDPOINTS]: "get-api-endpoints",
    [MessageType.GET_ACTIVE_ERRORS]: "get-active-errors",
    [MessageType.CLEAR_ERRORS]: "clear-errors",
    [MessageType.LOGGING_DEGRADED]: "logging-degraded",
    [MessageType.STORAGE_FULL]: "storage-full",
    [MessageType.NETWORK_STATUS]: "network-status",
    [MessageType.NETWORK_REQUEST]: "network-request",
    [MessageType.GET_NETWORK_REQUESTS]: "get-network-requests",
    [MessageType.GET_NETWORK_STATS]: "get-network-stats",
    [MessageType.CLEAR_NETWORK_REQUESTS]: "clear-network-requests",
    [MessageType.GET_STORAGE_STATS]: "get-storage-stats",
    [MessageType.QUERY_LOGS]: "query-logs",
    [MessageType.GET_LOG_DETAIL]: "get-log-detail",
    [MessageType.TOGGLE_XPATH_RECORDER]: "toggle-xpath-recorder",
    [MessageType.GET_RECORDED_XPATHS]: "get-recorded-xpaths",
    [MessageType.CLEAR_RECORDED_XPATHS]: "clear-recorded-xpaths",
    [MessageType.TEST_XPATH]: "test-xpath",
    [MessageType.VALIDATE_ALL_XPATHS]: "validate-all-xpaths",
    [MessageType.CONFIG_UPDATED]: "config-updated",
    [MessageType.TOKEN_EXPIRED]: "token-expired",
    [MessageType.TOKEN_UPDATED]: "token-updated",
    [MessageType.USER_SCRIPT_ERROR]: "user-script-error",
    [MessageType.USER_SCRIPT_LOG]: "user-script-log",
    [MessageType.USER_SCRIPT_DATA_SET]: "user-script-data-set",
    [MessageType.USER_SCRIPT_DATA_GET]: "user-script-data-get",
    [MessageType.USER_SCRIPT_DATA_DELETE]: "user-script-data-delete",
    [MessageType.USER_SCRIPT_DATA_KEYS]: "user-script-data-keys",
    [MessageType.USER_SCRIPT_DATA_GET_ALL]: "user-script-data-get-all",
    [MessageType.USER_SCRIPT_DATA_CLEAR]: "user-script-data-clear",
    [MessageType.GET_DATA_STORE_ALL]: "get-data-store-all",
    [MessageType.RECORD_CYCLE_METRIC]: "record-cycle-metric",
    [MessageType.GET_RUN_STATS]: "get-run-stats",
    [MessageType.CLEAR_RUN_STATS]: "clear-run-stats",
    [MessageType.GET_PROMPTS]: "get-prompts",
    [MessageType.SAVE_PROMPT]: "save-prompt",
    [MessageType.DELETE_PROMPT]: "delete-prompt",
    [MessageType.REORDER_PROMPTS]: "reorder-prompts",
    [MessageType.GET_PROMPT_CHAINS]: "get-prompt-chains",
    [MessageType.SAVE_PROMPT_CHAIN]: "save-prompt-chain",
    [MessageType.DELETE_PROMPT_CHAIN]: "delete-prompt-chain",
    [MessageType.EXECUTE_CHAIN_STEP]: "execute-chain-step",
    [MessageType.GET_SETTINGS]: "get-settings",
    [MessageType.SAVE_SETTINGS]: "save-settings",
    [MessageType.GET_PROMPT_VARIABLES]: "get-prompt-variables",
    [MessageType.SAVE_PROMPT_VARIABLES]: "save-prompt-variables",
    [MessageType.KV_GET]: "key-value-get",
    [MessageType.KV_SET]: "key-value-set",
    [MessageType.KV_DELETE]: "key-value-delete",
    [MessageType.KV_LIST]: "key-value-list",
    [MessageType.GKV_GET]: "grouped-key-value-get",
    [MessageType.GKV_SET]: "grouped-key-value-set",
    [MessageType.GKV_DELETE]: "grouped-key-value-delete",
    [MessageType.GKV_LIST]: "grouped-key-value-list",
    [MessageType.GKV_CLEAR_GROUP]: "grouped-key-value-clear-group",
    [MessageType.FILE_SAVE]: "file-save",
    [MessageType.FILE_GET]: "file-get",
    [MessageType.FILE_LIST]: "file-list",
    [MessageType.FILE_DELETE]: "file-delete",
    [MessageType.GET_RECENT_MESSAGES]: "get-recent-messages",
    [MessageType.GET_SESSION_LOGS]: "get-session-logs",
    [MessageType.STORAGE_LIST_TABLES]: "storage-list-tables",
    [MessageType.STORAGE_QUERY_TABLE]: "storage-query-table",
    [MessageType.STORAGE_UPDATE_ROW]: "storage-update-row",
    [MessageType.STORAGE_DELETE_ROW]: "storage-delete-row",
    [MessageType.STORAGE_GET_SCHEMA]: "storage-get-schema",
    [MessageType.STORAGE_CLEAR_TABLE]: "storage-clear-table",
    [MessageType.STORAGE_CLEAR_ALL]: "storage-clear-all",
    [MessageType.STORAGE_RESEED]: "storage-reseed",
    [MessageType.STORAGE_SESSION_LIST]: "storage-session-list",
    [MessageType.STORAGE_SESSION_SET]: "storage-session-set",
    [MessageType.STORAGE_SESSION_DELETE]: "storage-session-delete",
    [MessageType.STORAGE_SESSION_CLEAR]: "storage-session-clear",
    [MessageType.STORAGE_COOKIES_LIST]: "storage-cookies-list",
    [MessageType.STORAGE_COOKIES_SET]: "storage-cookies-set",
    [MessageType.STORAGE_COOKIES_DELETE]: "storage-cookies-delete",
    [MessageType.STORAGE_COOKIES_CLEAR]: "storage-cookies-clear",
    // ─── Prompts (additional) ───
    [MessageType.RESEED_PROMPTS]: "reseed-prompts",
    // ─── Marco SDK (Spec 18) ───
    [MessageType.AUTH_GET_TOKEN]: "auth-get-token",
    [MessageType.AUTH_GET_SOURCE]: "auth-get-source",
    [MessageType.AUTH_REFRESH]: "auth-refresh",
    [MessageType.AUTH_IS_EXPIRED]: "auth-is-expired",
    [MessageType.AUTH_GET_JWT]: "auth-get-jwt",
    [MessageType.COOKIES_GET]: "cookies-get",
    [MessageType.COOKIES_GET_DETAIL]: "cookies-get-detail",
    [MessageType.COOKIES_GET_ALL]: "cookies-get-all",
    [MessageType.CONFIG_GET]: "config-get",
    [MessageType.CONFIG_GET_ALL]: "config-get-all",
    [MessageType.CONFIG_SET]: "config-set",
    [MessageType.CONFIG_CHANGED]: "config-changed",
    [MessageType.XPATH_GET]: "xpath-get",
    [MessageType.XPATH_GET_ALL]: "xpath-get-all",
    [MessageType.FILE_READ]: "file-read",
    // ─── Updater (Spec 58) ───
    [MessageType.LIST_UPDATERS]: "list-updaters",
    [MessageType.GET_UPDATER]: "get-updater",
    [MessageType.CREATE_UPDATER]: "create-updater",
    [MessageType.DELETE_UPDATER]: "delete-updater",
    [MessageType.CHECK_FOR_UPDATE]: "check-for-update",
    [MessageType.GET_UPDATE_SETTINGS]: "get-update-settings",
    [MessageType.SAVE_UPDATE_SETTINGS]: "save-update-settings",
    // ─── Project Database API (Spec 67) ───
    [MessageType.PROJECT_API]: "project-api",
    [MessageType.PROJECT_DB_CREATE_TABLE]: "project-db-create-table",
    [MessageType.PROJECT_DB_DROP_TABLE]: "project-db-drop-table",
    [MessageType.PROJECT_DB_LIST_TABLES]: "project-db-list-tables",
    // ─── Project Config DB (Issue 85) ───
    [MessageType.PROJECT_CONFIG_READ]: "project-config-read",
    [MessageType.PROJECT_CONFIG_UPDATE]: "project-config-update",
    [MessageType.PROJECT_CONFIG_RECONSTRUCT]: "project-config-reconstruct",
    // ─── Schema Meta Engine (Issue 85) ───
    [MessageType.APPLY_JSON_SCHEMA]: "apply-json-schema",
    [MessageType.GENERATE_SCHEMA_DOCS]: "generate-schema-docs",
    // ─── Automation Chains (Spec 21) ───
    [MessageType.GET_AUTOMATION_CHAINS]: "get-automation-chains",
    [MessageType.SAVE_AUTOMATION_CHAIN]: "save-automation-chain",
    [MessageType.DELETE_AUTOMATION_CHAIN]: "delete-automation-chain",
    [MessageType.TOGGLE_AUTOMATION_CHAIN]: "toggle-automation-chain",
    [MessageType.IMPORT_AUTOMATION_CHAINS]: "import-automation-chains",
    // ─── Script Hot-Reload (Issue 77) ───
    [MessageType.GET_SCRIPT_INFO]: "get-script-info",
    [MessageType.HOT_RELOAD_SCRIPT]: "hot-reload-script",
    // ─── Cache Management (Issue 88) ───
    [MessageType.INVALIDATE_CACHE]: "invalidate-cache",
    [MessageType.GET_CACHE_STATS]: "get-cache-stats",
};

function toDisplayName(type: MessageType): string {
    return DISPLAY_NAME_MAP[type] ?? type.toLowerCase().replace(/_/g, "-");
}

function inferCategory(type: MessageType): string {
    if (type.startsWith("GET_") || type.startsWith("CLEAR_") || type.includes("HEALTH") || type.includes("STATUS")) {
        return "Diagnostics";
    }
    if (type.includes("PROMPT")) return "Prompts";
    if (type.includes("SCRIPT") || type.includes("CONFIG")) return "Scripts & Configs";
    if (type.includes("PROJECT")) return "Projects";
    if (type.includes("KV")) return "KV Storage";
    if (type.includes("FILE")) return "File Storage";
    if (type.includes("STORAGE")) return "Storage Browser";
    if (type.includes("XPATH")) return "XPath";
    if (type.includes("NETWORK")) return "Network";
    return "General";
}

function inferMutating(type: MessageType): boolean {
    return /(SAVE|DELETE|CLEAR|SET|IMPORT|TOGGLE|INJECT|REORDER|PURGE|EXECUTE|RECORD|LOG_)/.test(type);
}

function inferDescription(type: MessageType): string {
    if (type.startsWith("GET_")) return `Reads data using ${type}.`;
    if (type.startsWith("SAVE_")) return `Creates or updates data using ${type}.`;
    if (type.startsWith("DELETE_")) return `Deletes data using ${type}.`;
    if (type.startsWith("CLEAR_")) return `Clears state/data using ${type}.`;
    return `Handles ${type} request.`;
}

// eslint-disable-next-line max-lines-per-function
function inferExampleRequest(type: MessageType): Record<string, unknown> {
    switch (type) {
        case MessageType.GET_LOG_DETAIL:
            return { type, database: "logs", rowId: 1 };
        case MessageType.QUERY_LOGS:
            return { type, database: "logs", offset: 0, limit: 25 };
        case MessageType.KV_GET:
            return { type, projectId: "_global", key: "example_key" };
        case MessageType.KV_DELETE:
            return { type, projectId: "_global", key: "example_key" };
        case MessageType.KV_LIST:
            return { type, projectId: "_global" };
        case MessageType.GKV_GET:
            return { type, group: "rename_forbidden", key: "workspace_id" };
        case MessageType.GKV_DELETE:
            return { type, group: "rename_forbidden", key: "workspace_id" };
        case MessageType.GKV_LIST:
        case MessageType.GKV_CLEAR_GROUP:
            return { type, group: "rename_forbidden" };
        case MessageType.STORAGE_QUERY_TABLE:
            return { type, table: "Prompts", offset: 0, limit: 25 };
        case MessageType.STORAGE_GET_SCHEMA:
        case MessageType.STORAGE_CLEAR_TABLE:
            return { type, table: "Prompts" };
        case MessageType.STORAGE_SESSION_LIST:
            return { type, prefix: "marco_" };
        case MessageType.STORAGE_SESSION_SET:
            return { type, key: "marco_example", value: { foo: "bar" } };
        case MessageType.STORAGE_SESSION_DELETE:
            return { type, key: "marco_example" };
        case MessageType.STORAGE_SESSION_CLEAR:
            return { type, prefix: "marco_" };
        case MessageType.STORAGE_COOKIES_LIST:
            return { type, domain: "lovable.dev" };
        case MessageType.STORAGE_COOKIES_SET:
            return {
                type,
                name: "marco_test_cookie",
                value: "hello",
                domain: "lovable.dev",
                path: "/",
                secure: true,
                sameSite: "lax",
            };
        case MessageType.STORAGE_COOKIES_DELETE:
            return { type, name: "marco_test_cookie", url: "https://lovable.dev/" };
        case MessageType.STORAGE_COOKIES_CLEAR:
            return { type, domain: "lovable.dev" };
        default:
            return { type };
    }
}

export function buildApiEndpointsResponse(): {
    isOk: true;
    generatedAt: string;
    total: number;
    endpoints: EndpointDoc[];
} {
    const allEndpointTypes = Object.values(MessageType) as MessageType[];

    const endpoints: EndpointDoc[] = allEndpointTypes
        .sort((a, b) => a.localeCompare(b))
        .map((type) => {
            const override = ENDPOINT_OVERRIDES[type];
            return {
                type,
                displayName: toDisplayName(type),
                category: override?.category ?? inferCategory(type),
                description: override?.description ?? inferDescription(type),
                isMutating: inferMutating(type),
                exampleRequest: override?.exampleRequest ?? inferExampleRequest(type),
            };
        });

    return {
        isOk: true,
        generatedAt: new Date().toISOString(),
        total: endpoints.length,
        endpoints,
    };
}

export async function buildApiStatusResponse(): Promise<{
    isOk: true;
    service: string;
    version: string;
    connection: string;
    health: string;
    bootStep: string;
    persistenceMode: string;
    endpointCount: number;
    timestamp: string;
}> {
    const [status, health] = await Promise.all([
        buildStatusResponse(),
        buildHealthResponse(),
    ]);

    return {
        isOk: true,
        service: "Marco Extension Message API",
        version: status.version,
        connection: status.connection,
        health: health.state,
        bootStep: status.bootStep,
        persistenceMode: status.persistenceMode,
        endpointCount: (Object.values(MessageType) as MessageType[]).length,
        timestamp: new Date().toISOString(),
    };
}
