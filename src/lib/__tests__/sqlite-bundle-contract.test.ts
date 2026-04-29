/**
 * Strict bundle schema validator — unit tests
 *
 * Drives `validateBundleSchema()` with a hand-rolled SqlExecCapable stub
 * so the test runs in milliseconds without spinning up sql.js / wasm.
 *
 * Coverage:
 *   1. Happy path — current PascalCase v4 bundle passes.
 *   2. Legacy v3 snake_case bundle is rejected with LEGACY_SNAKE_CASE.
 *   3. Missing required column triggers MISSING_COLUMN.
 *   4. Unknown extra column triggers UNKNOWN_COLUMN.
 *   5. Wrong format_version triggers UNSUPPORTED_FORMAT_VERSION.
 *   6. Missing format_version triggers MISSING_FORMAT_VERSION.
 *   7. Missing whole table triggers MISSING_TABLE with helpful hint
 *      when a lowercase legacy variant is present.
 *   8. prompts-only mode does NOT require Projects/Scripts/Configs.
 */

import { describe, it, expect } from "vitest";
import {
    validateBundleSchema,
    formatValidationError,
    BUNDLE_SCHEMA,
    type SqlExecCapable,
    type SqlExecRow,
} from "@/lib/sqlite-bundle-contract";

/* ------------------------------------------------------------------ */
/*  Stub helpers                                                       */
/* ------------------------------------------------------------------ */

interface TableDef {
    name: string;
    columns: string[];
}

interface BundleSpec {
    tables: TableDef[];
    /** Value of Meta.format_version row. Omit to simulate "missing". */
    formatVersion?: string | null;
}

/**
 * Builds a stub matching what `validateBundleSchema` actually queries:
 *   - SELECT name FROM sqlite_master WHERE type='table' …
 *   - PRAGMA table_info("<TableName>")
 *   - SELECT Value FROM Meta WHERE Key = 'format_version'
 */
function makeDb(spec: BundleSpec): SqlExecCapable {
    return {
        exec(sql: string): SqlExecRow[] {
            const trimmed = sql.trim();

            if (trimmed.startsWith("SELECT name FROM sqlite_master")) {
                return [{
                    columns: ["name"],
                    values: spec.tables.map((t) => [t.name]),
                }];
            }

            const pragmaMatch = /^PRAGMA table_info\("([^"]+)"\)$/.exec(trimmed);
            if (pragmaMatch) {
                const tableName = pragmaMatch[1];
                const table = spec.tables.find((t) => t.name === tableName);
                if (!table) return [];
                // PRAGMA table_info returns rows shaped as
                //   [cid, name, type, notnull, dflt_value, pk]
                // Validator reads column index 1 ("name").
                return [{
                    columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
                    values: table.columns.map((c, i) => [i, c, "TEXT", 0, null, 0]),
                }];
            }

            if (trimmed.startsWith("SELECT Value FROM Meta")) {
                if (spec.formatVersion === undefined) {
                    // Simulate Meta table entirely missing the row
                    return [{ columns: ["Value"], values: [] }];
                }
                if (spec.formatVersion === null) {
                    return [{ columns: ["Value"], values: [] }];
                }
                return [{
                    columns: ["Value"],
                    values: [[spec.formatVersion]],
                }];
            }

            // Unknown query — return empty so the validator surfaces a
            // READ_ERROR or treats as missing (whichever it does naturally).
            return [];
        },
    };
}

/** A complete, contract-compliant v4 bundle (every required column present). */
function fullValidBundle(): BundleSpec {
    return {
        formatVersion: "4",
        tables: Object.entries(BUNDLE_SCHEMA).map(([name, contract]) => ({
            name,
            columns: [...contract.required],
        })),
    };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("validateBundleSchema — happy path", () => {
    it("accepts a v4 PascalCase bundle with every required column", () => {
        const result = validateBundleSchema(makeDb(fullValidBundle()), "full");
        expect(result.ok).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.formatVersion).toBe("4");
    });

    it("accepts optional columns alongside required ones", () => {
        const spec = fullValidBundle();
        // Add the optional Uid + Description to Projects
        const projects = spec.tables.find((t) => t.name === "Projects");
        projects!.columns.push("Uid", "Description");
        const result = validateBundleSchema(makeDb(spec), "full");
        expect(result.ok).toBe(true);
    });
});

describe("validateBundleSchema — legacy snake_case rejection", () => {
    it("rejects a v3-style bundle with snake_case table + columns", () => {
        const result = validateBundleSchema(
            makeDb({
                formatVersion: "3",
                tables: [
                    { name: "projects", columns: ["id", "name", "created_at"] },
                    { name: "scripts", columns: ["id", "name", "code"] },
                    { name: "configs", columns: ["id", "name", "json"] },
                    { name: "meta", columns: ["id", "key", "value"] },
                ],
            }),
            "full",
        );
        expect(result.ok).toBe(false);
        const codes = result.errors.map((e) => e.code);
        // Expect MISSING_TABLE for each PascalCase table + LEGACY_SNAKE_CASE for each lowercase one
        expect(codes).toContain("MISSING_TABLE");
        expect(codes).toContain("LEGACY_SNAKE_CASE");
        // The MISSING_TABLE error for Projects should hint at the legacy variant
        const missingProjects = result.errors.find(
            (e) => e.code === "MISSING_TABLE" && e.table === "Projects",
        );
        expect(missingProjects?.message).toMatch(/legacy 'projects'/i);
    });

    it("rejects a single legacy snake_case column inside an otherwise-clean Projects table", () => {
        const spec = fullValidBundle();
        const projects = spec.tables.find((t) => t.name === "Projects")!;
        projects.columns.push("created_at"); // legacy duplicate
        const result = validateBundleSchema(makeDb(spec), "full");
        expect(result.ok).toBe(false);
        const err = result.errors.find(
            (e) => e.code === "LEGACY_SNAKE_CASE" && e.column === "created_at",
        );
        expect(err).toBeDefined();
        expect(err!.message).toMatch(/PascalCase/);
    });
});

describe("validateBundleSchema — column-level drift", () => {
    it("flags a missing required column with MISSING_COLUMN", () => {
        const spec = fullValidBundle();
        const scripts = spec.tables.find((t) => t.name === "Scripts")!;
        scripts.columns = scripts.columns.filter((c) => c !== "Code");
        const result = validateBundleSchema(makeDb(spec), "full");
        expect(result.ok).toBe(false);
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                code: "MISSING_COLUMN",
                table: "Scripts",
                column: "Code",
            }),
        );
    });

    it("flags an unknown extra PascalCase column with UNKNOWN_COLUMN", () => {
        const spec = fullValidBundle();
        const projects = spec.tables.find((t) => t.name === "Projects")!;
        projects.columns.push("MysteryFieldFromTheFuture");
        const result = validateBundleSchema(makeDb(spec), "full");
        expect(result.ok).toBe(false);
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                code: "UNKNOWN_COLUMN",
                table: "Projects",
                column: "MysteryFieldFromTheFuture",
            }),
        );
    });

    it("flags an unknown extra PascalCase table with UNKNOWN_TABLE", () => {
        const spec = fullValidBundle();
        spec.tables.push({ name: "ShinyNewThing", columns: ["Id", "Name"] });
        const result = validateBundleSchema(makeDb(spec), "full");
        expect(result.ok).toBe(false);
        expect(result.errors).toContainEqual(
            expect.objectContaining({
                code: "UNKNOWN_TABLE",
                table: "ShinyNewThing",
            }),
        );
    });
});

describe("validateBundleSchema — format_version gate", () => {
    it("rejects a bundle missing Meta.format_version", () => {
        const spec = fullValidBundle();
        spec.formatVersion = null; // row absent
        const result = validateBundleSchema(makeDb(spec), "full");
        expect(result.ok).toBe(false);
        expect(result.errors.map((e) => e.code)).toContain("MISSING_FORMAT_VERSION");
    });

    it("rejects an unsupported format_version", () => {
        const spec = fullValidBundle();
        spec.formatVersion = "99";
        const result = validateBundleSchema(makeDb(spec), "full");
        expect(result.ok).toBe(false);
        expect(result.errors.map((e) => e.code)).toContain("UNSUPPORTED_FORMAT_VERSION");
    });
});

describe("validateBundleSchema — prompts-only mode", () => {
    it("does NOT require Projects/Scripts/Configs", () => {
        const result = validateBundleSchema(
            makeDb({
                formatVersion: "4",
                tables: [
                    { name: "Prompts", columns: [...BUNDLE_SCHEMA.Prompts.required] },
                    { name: "Meta", columns: [...BUNDLE_SCHEMA.Meta.required] },
                ],
            }),
            "prompts-only",
        );
        expect(result.ok).toBe(true);
    });

    it("still rejects legacy 'prompts' table in prompts-only mode", () => {
        const result = validateBundleSchema(
            makeDb({
                formatVersion: "4",
                tables: [
                    { name: "prompts", columns: ["id", "name", "text"] },
                    { name: "Meta", columns: [...BUNDLE_SCHEMA.Meta.required] },
                ],
            }),
            "prompts-only",
        );
        expect(result.ok).toBe(false);
        expect(result.errors.map((e) => e.code)).toContain("MISSING_TABLE");
    });
});

describe("formatValidationError", () => {
    it("returns empty string when ok", () => {
        expect(formatValidationError({ ok: true, formatVersion: "4", errors: [] })).toBe("");
    });

    it("renders error count and per-error code prefix", () => {
        const msg = formatValidationError({
            ok: false,
            formatVersion: null,
            errors: [
                { code: "MISSING_TABLE", message: "x", table: "Projects" },
                { code: "LEGACY_SNAKE_CASE", message: "y", table: "projects" },
            ],
        });
        expect(msg).toMatch(/2 errors/);
        expect(msg).toMatch(/\[MISSING_TABLE\]/);
        expect(msg).toMatch(/\[LEGACY_SNAKE_CASE\]/);
        expect(msg).toMatch(/PascalCase v4 contract/);
    });

    it("truncates after 10 entries and surfaces a summary line", () => {
        const errors = Array.from({ length: 15 }, (_, i) => ({
            code: "MISSING_COLUMN" as const,
            message: `col${i} missing`,
            table: "Projects",
            column: `Col${i}`,
        }));
        const msg = formatValidationError({ ok: false, formatVersion: "4", errors });
        expect(msg).toMatch(/and 5 more error\(s\)/);
    });
});
