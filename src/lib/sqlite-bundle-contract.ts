/**
 * Marco Extension — Bundle SQLite PascalCase Contract
 *
 * Single source of truth for the import/export bundle schema
 * (`marco-backup.zip` → `marco-backup.db`).
 *
 * Consumed by:
 *   1. Runtime importer  — `validateBundleSchema()` in `sqlite-bundle.ts`
 *      rejects any bundle whose tables/columns drift from this contract
 *      (legacy snake_case, missing columns, unknown tables, etc.).
 *   2. CI schema-drift guard — `scripts/check-bundle-schema-contract.mjs`
 *      parses the live `CREATE TABLE` source in `sqlite-bundle.ts` and
 *      asserts every table+column matches this contract. A drift between
 *      source and contract fails CI before merge.
 *
 * RULES
 *   - All table names: PascalCase, no underscores.
 *   - All column names: PascalCase, no underscores.
 *   - `Id` columns are INTEGER PRIMARY KEY AUTOINCREMENT.
 *   - Runtime UUIDs live in a separate `Uid TEXT` column (v4+).
 *   - Required tables are ALWAYS present in a valid bundle.
 *     Optional tables may be absent (e.g. prompts-only export).
 *
 * Format version: '5' (current). v4 still accepted for read-back compat.
 *
 * v5 additions vs v4 (all optional, additive — v4 bundles still validate):
 *   - Projects: Slug, Cookies, Dependencies, IsGlobal, IsRemovable
 *   - Scripts:  UpdateUrl, LastUpdateCheck
 *   - Prompts:  Slug is now actually emitted (was contract-allowed in v4
 *               but never written — see audit Pr-1 / Task Next resolver).
 *
 * See also:
 *   - docs/diagrams/sqlite-bundle-erd.mmd
 *   - spec/02-coding-guidelines/coding-guidelines/database-naming.md
 *   - spec/02-coding-guidelines/coding-guidelines/database-id-convention.md
 */

/** Snapshot of one bundle table's expected PascalCase columns. */
export interface BundleTableContract {
    /** Required columns — bundle is rejected if any is missing. */
    readonly required: readonly string[];
    /**
     * Optional columns — present in newer bundles, absent in some legacy
     * v3 bundles. Allowed but not required. Anything NOT in `required`
     * or `optional` is an unknown column and rejected.
     */
    readonly optional: readonly string[];
}

/** Identifier-style assertion: must start [A-Z] and contain no underscores. */
const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

/**
 * Canonical bundle schema (format_version = '4').
 *
 * Mirrors `CREATE_*_TABLE` constants in `src/lib/sqlite-bundle.ts`.
 * If you add/remove a column there, update the matching entry here —
 * the CI guard and the runtime validator both pin against this map.
 */
export const BUNDLE_SCHEMA: Readonly<Record<string, BundleTableContract>> = {
    Projects: {
        required: [
            "Id", "Name", "Version", "CreatedAt", "UpdatedAt",
            "TargetUrls", "Scripts", "Configs", "CookieRules", "Settings",
        ],
        optional: [
            "Uid", "SchemaVersion", "Description",
            // v5 additions — runtime fields that previously round-tripped as null
            "Slug", "Cookies", "Dependencies", "IsGlobal", "IsRemovable",
        ],
    },
    Scripts: {
        required: ["Id", "Name", "Code", "RunOrder", "CreatedAt", "UpdatedAt"],
        optional: [
            "Uid", "Description", "RunAt", "ConfigBinding",
            "IsIife", "HasDomUsage",
            // v5 additions — auto-update path was being silently disabled on import
            "UpdateUrl", "LastUpdateCheck",
        ],
    },
    Configs: {
        required: ["Id", "Name", "Json", "CreatedAt", "UpdatedAt"],
        optional: ["Uid", "Description"],
    },
    Prompts: {
        required: ["Id", "Name", "Text", "RunOrder", "CreatedAt", "UpdatedAt"],
        optional: [
            "Uid", "IsDefault", "IsFavorite", "Category",
            // PromptsDetails view + runtime PromptsToCategory rollups can
            // surface these in alternate exports — accept but never require.
            "Slug", "Version", "SortOrder",
        ],
    },
    Meta: {
        required: ["Id", "Key", "Value"],
        optional: [],
    },
} as const;

/** Tables that MUST exist in a full bundle. */
export const REQUIRED_TABLES = ["Projects", "Scripts", "Configs", "Meta"] as const;

/** Tables that MUST exist in a prompts-only bundle. */
export const REQUIRED_PROMPTS_ONLY_TABLES = ["Prompts", "Meta"] as const;

/** Bundle modes the validator can be asked to enforce. */
export type BundleMode = "full" | "prompts-only";

/** Result of a strict schema validation pass. */
export interface BundleValidationResult {
    ok: boolean;
    formatVersion: string | null;
    errors: BundleValidationError[];
}

export interface BundleValidationError {
    /** Stable machine-readable code (lets callers branch on category). */
    code:
        | "MISSING_TABLE"
        | "UNKNOWN_TABLE"
        | "MISSING_COLUMN"
        | "UNKNOWN_COLUMN"
        | "NON_PASCAL_TABLE"
        | "NON_PASCAL_COLUMN"
        | "LEGACY_SNAKE_CASE"
        | "MISSING_FORMAT_VERSION"
        | "UNSUPPORTED_FORMAT_VERSION"
        | "READ_ERROR";
    /** Human-readable, actionable error message (always present). */
    message: string;
    /** Affected table name, when applicable. */
    table?: string;
    /** Affected column name, when applicable. */
    column?: string;
}

/**
 * Format versions this build understands. v3 bundles must be migrated first.
 *
 * v5 is the current emit version; v4 is still accepted for read-back so a
 * bundle exported from a previous build still imports cleanly (the v5
 * additions are all OPTIONAL columns — a v4 DB satisfies the v5 contract,
 * it just round-trips the new fields as undefined).
 */
export const SUPPORTED_FORMAT_VERSIONS = ["4", "5"] as const;
/** Version this build emits when exporting a fresh bundle. */
export const CURRENT_FORMAT_VERSION = "5" as const;

/* ------------------------------------------------------------------ */
/*  Validator (db-shape-agnostic — works on any sql.js-compatible db)  */
/* ------------------------------------------------------------------ */

/**
 * Minimal sql.js Database surface we depend on. Lets us validate without
 * importing the full sql.js types into this file (and lets tests pass
 * a stub).
 */
export interface SqlExecRow {
    columns: string[];
    values: unknown[][];
}
export interface SqlExecCapable {
    exec(sql: string): SqlExecRow[];
}

/**
 * Strictly validates a bundle DB against the PascalCase contract.
 *
 * Returns an aggregate result rather than throwing — callers decide
 * how to surface the errors (toast, modal, etc.). The runtime importer
 * throws a single combined error using `formatValidationError(result)`.
 *
 * @param db   Open sql.js Database (do NOT close before calling).
 * @param mode "full" requires Projects/Scripts/Configs/Meta;
 *             "prompts-only" requires Prompts/Meta.
 */
export function validateBundleSchema(
    db: SqlExecCapable,
    mode: BundleMode = "full",
): BundleValidationResult {
    const errors: BundleValidationError[] = [];

    let actualTables: string[] = [];
    try {
        const rows = db.exec(
            "SELECT name FROM sqlite_master WHERE type='table' " +
            "AND name NOT LIKE 'sqlite_%'",
        );
        actualTables = rows[0]?.values.map((r) => String(r[0])) ?? [];
    } catch (e) {
        return {
            ok: false,
            formatVersion: null,
            errors: [{
                code: "READ_ERROR",
                message: `Cannot read sqlite_master from bundle: ${(e as Error).message}`,
            }],
        };
    }

    /* ---- 1. Required tables present ---- */
    const requiredTables = mode === "full"
        ? REQUIRED_TABLES
        : REQUIRED_PROMPTS_ONLY_TABLES;
    for (const t of requiredTables) {
        if (!actualTables.includes(t)) {
            // Friendlier hint when the legacy lowercase variant exists
            const legacy = t.toLowerCase();
            const hint = actualTables.includes(legacy)
                ? ` Found legacy '${legacy}' instead — bundle predates the PascalCase migration (v4) and must be re-exported from a newer build.`
                : "";
            errors.push({
                code: "MISSING_TABLE",
                table: t,
                message: `Required table '${t}' is missing from bundle.${hint}`,
            });
        }
    }

    /* ---- 2. Unknown / legacy table detection ---- */
    for (const t of actualTables) {
        if (BUNDLE_SCHEMA[t] !== undefined) continue;
        // Distinguish "legacy snake_case" from "completely unknown" so the
        // user gets a precise migration message rather than a generic one.
        if (t.includes("_") || /^[a-z]/.test(t)) {
            errors.push({
                code: "LEGACY_SNAKE_CASE",
                table: t,
                message:
                    `Bundle contains legacy table '${t}'. PascalCase is required ` +
                    `(format_version 4+). Re-export from a newer build of the extension.`,
            });
        } else if (!PASCAL_CASE.test(t)) {
            errors.push({
                code: "NON_PASCAL_TABLE",
                table: t,
                message: `Bundle table '${t}' is not PascalCase.`,
            });
        } else {
            errors.push({
                code: "UNKNOWN_TABLE",
                table: t,
                message:
                    `Bundle contains unknown table '${t}' that is not part of ` +
                    `the v4 contract. Refusing to import to avoid silent data loss.`,
            });
        }
    }

    /* ---- 3. Per-table column checks ---- */
    for (const tableName of Object.keys(BUNDLE_SCHEMA)) {
        if (!actualTables.includes(tableName)) continue; // already reported above
        const contract = BUNDLE_SCHEMA[tableName];
        validateTableColumns(db, tableName, contract, errors);
    }

    /* ---- 4. format_version gate ---- */
    let formatVersion: string | null = null;
    if (actualTables.includes("Meta")) {
        try {
            const rows = db.exec(
                "SELECT Value FROM Meta WHERE Key = 'format_version'",
            );
            formatVersion = rows[0]?.values[0]?.[0] != null
                ? String(rows[0].values[0][0])
                : null;
        } catch {
            // Fall back to legacy lowercase Meta — but that itself is a
            // PascalCase violation already reported above. Don't double-fail.
        }
    }
    if (formatVersion === null && mode === "full") {
        errors.push({
            code: "MISSING_FORMAT_VERSION",
            message:
                "Bundle is missing Meta.format_version. v3 and earlier bundles " +
                "are not supported by strict import — re-export from a newer build.",
        });
    } else if (
        formatVersion !== null &&
        !SUPPORTED_FORMAT_VERSIONS.includes(formatVersion as typeof SUPPORTED_FORMAT_VERSIONS[number])
    ) {
        errors.push({
            code: "UNSUPPORTED_FORMAT_VERSION",
            message:
                `Bundle declares format_version='${formatVersion}'. ` +
                `This build supports: ${SUPPORTED_FORMAT_VERSIONS.join(", ")}.`,
        });
    }

    return { ok: errors.length === 0, formatVersion, errors };
}

function validateTableColumns(
    db: SqlExecCapable,
    tableName: string,
    contract: BundleTableContract,
    errors: BundleValidationError[],
): void {
    let actualColumns: string[];
    try {
        // PRAGMA table_info is schema-introspection — uses the table NAME
        // as a literal identifier, not a bind value, so we inline-quote it
        // (table is already validated against the contract whitelist).
        const rows = db.exec(`PRAGMA table_info("${tableName}")`);
        actualColumns = rows[0]?.values.map((r) => String(r[1])) ?? [];
    } catch (e) {
        errors.push({
            code: "READ_ERROR",
            table: tableName,
            message: `Cannot introspect columns of '${tableName}': ${(e as Error).message}`,
        });
        return;
    }

    const allowed = new Set([...contract.required, ...contract.optional]);

    /* Missing required columns */
    for (const col of contract.required) {
        if (!actualColumns.includes(col)) {
            errors.push({
                code: "MISSING_COLUMN",
                table: tableName,
                column: col,
                message:
                    `Required column '${tableName}.${col}' is missing. ` +
                    `Bundle does not match the v4 PascalCase contract.`,
            });
        }
    }

    /* Unknown / legacy columns */
    for (const col of actualColumns) {
        if (allowed.has(col)) continue;
        if (col.includes("_") || /^[a-z]/.test(col)) {
            errors.push({
                code: "LEGACY_SNAKE_CASE",
                table: tableName,
                column: col,
                message:
                    `Bundle column '${tableName}.${col}' uses legacy ` +
                    `snake_case/camelCase. PascalCase is required (v4).`,
            });
        } else if (!PASCAL_CASE.test(col)) {
            errors.push({
                code: "NON_PASCAL_COLUMN",
                table: tableName,
                column: col,
                message: `Column '${tableName}.${col}' is not PascalCase.`,
            });
        } else {
            errors.push({
                code: "UNKNOWN_COLUMN",
                table: tableName,
                column: col,
                message:
                    `Bundle has unknown column '${tableName}.${col}' not declared ` +
                    `in the v4 contract. Refusing to import to avoid silent data loss.`,
            });
        }
    }
}

/**
 * Renders a `BundleValidationResult` into a single multi-line error
 * suitable for `throw new Error(formatValidationError(result))`.
 *
 * Keeps the first ~10 errors verbatim and summarises the rest so a UI
 * toast / dialog stays readable when an entire schema is wrong.
 */
export function formatValidationError(result: BundleValidationResult): string {
    if (result.ok) return "";
    const MAX = 10;
    const head = result.errors.slice(0, MAX).map((e, i) => `  ${i + 1}. [${e.code}] ${e.message}`);
    const tail = result.errors.length > MAX
        ? [`  … and ${result.errors.length - MAX} more error(s).`]
        : [];
    return [
        `Bundle schema validation failed (${result.errors.length} error${result.errors.length === 1 ? "" : "s"}):`,
        ...head,
        ...tail,
        "",
        "The bundle does not conform to the PascalCase v4 contract. " +
        "Re-export from a current build of the extension, or use a migration tool.",
    ].join("\n");
}
