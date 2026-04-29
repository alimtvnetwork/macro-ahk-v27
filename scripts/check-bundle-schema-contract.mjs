#!/usr/bin/env node
/**
 * check-bundle-schema-contract.mjs
 *
 * CI schema-drift guard for the SQLite import/export bundle.
 *
 * Parses the live `CREATE TABLE` SQL in `src/lib/sqlite-bundle.ts` and
 * asserts that every emitted table + column matches the canonical
 * PascalCase v4 contract declared in `src/lib/sqlite-bundle-contract.ts`
 * (the same map consumed by the runtime importer).
 *
 * Failure modes (each emits a GitHub Actions ::error annotation and a
 * non-zero exit):
 *   - Source declares a table not present in the contract.
 *   - Contract declares a required column the source no longer emits.
 *   - Source emits a column with snake_case / non-PascalCase identifier.
 *   - Source emits a column not declared in the contract (would silently
 *     break import validation if shipped).
 *
 * Wired into `.github/workflows/ci.yml` as a fast preflight job.
 *
 * Pure Node, no deps. Runs in well under a second.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");
const SRC = resolve(REPO, "src/lib/sqlite-bundle.ts");
const CONTRACT = resolve(REPO, "src/lib/sqlite-bundle-contract.ts");

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

/* ------------------------------------------------------------------ */
/*  Parse: extract { TableName: [columns] } from CREATE TABLE blocks   */
/* ------------------------------------------------------------------ */

function parseCreateTables(source) {
    const out = {};
    // Match: CREATE TABLE IF NOT EXISTS <Name> ( <body> )
    const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\)\s*;?\s*`/g;
    let m;
    while ((m = re.exec(source)) !== null) {
        const tableName = m[1];
        const body = m[2];
        const columns = [];
        for (const rawLine of body.split("\n")) {
            const line = rawLine.trim().replace(/,$/, "");
            if (!line || line.startsWith("--")) continue;
            // Skip table-level constraints (PRIMARY KEY (...), UNIQUE (...), etc.)
            if (/^(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK)\b/i.test(line)) continue;
            // First token is the column identifier.
            const tok = line.split(/\s+/)[0];
            if (tok && /^[A-Za-z_][A-Za-z0-9_]*$/.test(tok)) {
                columns.push(tok);
            }
        }
        out[tableName] = columns;
    }
    return out;
}

/* ------------------------------------------------------------------ */
/*  Parse: extract BUNDLE_SCHEMA from the contract TS file             */
/* ------------------------------------------------------------------ */

function parseContract(source) {
    // Find the BUNDLE_SCHEMA = { … } block (object literal up to its
    // matching closing brace before `} as const;`).
    const startIdx = source.indexOf("export const BUNDLE_SCHEMA");
    if (startIdx === -1) throw new Error("BUNDLE_SCHEMA not found in contract file");
    const openBrace = source.indexOf("{", startIdx);
    let depth = 0, i = openBrace;
    for (; i < source.length; i++) {
        if (source[i] === "{") depth++;
        else if (source[i] === "}") { depth--; if (depth === 0) break; }
    }
    const block = source.slice(openBrace, i + 1);

    const out = {};
    const tableRe = /(\w+):\s*\{\s*required:\s*\[([^\]]*)\],\s*optional:\s*\[([^\]]*)\]/g;
    let m;
    while ((m = tableRe.exec(block)) !== null) {
        const name = m[1];
        const required = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
        const optional = [...m[3].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
        out[name] = { required, optional };
    }
    return out;
}

/* ------------------------------------------------------------------ */
/*  Compare and emit                                                   */
/* ------------------------------------------------------------------ */

function annotate(file, message) {
    // GitHub Actions inline error annotation.
    const safe = message.replace(/\r?\n/g, " ").replace(/::/g, " ");
    console.log(`::error file=${file}::${safe}`);
}

function main() {
    const srcText = readFileSync(SRC, "utf8");
    const contractText = readFileSync(CONTRACT, "utf8");

    const sourceTables = parseCreateTables(srcText);
    const contractTables = parseContract(contractText);

    const errors = [];

    /* --- 1. Tables in source but not in contract --- */
    for (const t of Object.keys(sourceTables)) {
        if (!contractTables[t]) {
            errors.push({
                file: SRC,
                msg: `Source emits table '${t}' but BUNDLE_SCHEMA does not declare it. ` +
                     `Add it to src/lib/sqlite-bundle-contract.ts or remove from CREATE TABLE.`,
            });
        }
    }
    /* --- 2. Tables in contract but not in source --- */
    for (const t of Object.keys(contractTables)) {
        if (!sourceTables[t]) {
            errors.push({
                file: CONTRACT,
                msg: `BUNDLE_SCHEMA declares table '${t}' but no matching CREATE TABLE ` +
                     `exists in src/lib/sqlite-bundle.ts.`,
            });
        }
    }

    /* --- 3. Per-table column comparison + PascalCase enforcement --- */
    for (const t of Object.keys(sourceTables)) {
        const contract = contractTables[t];
        if (!contract) continue;
        const sourceCols = sourceTables[t];
        const declared = new Set([...contract.required, ...contract.optional]);

        for (const col of sourceCols) {
            if (!PASCAL_CASE.test(col)) {
                errors.push({
                    file: SRC,
                    msg: `Table ${t}: column '${col}' is not PascalCase. ` +
                         `All bundle columns must match /^[A-Z][A-Za-z0-9]*$/.`,
                });
                continue;
            }
            if (!declared.has(col)) {
                errors.push({
                    file: SRC,
                    msg: `Table ${t}: column '${col}' is emitted by CREATE TABLE but not ` +
                         `declared in BUNDLE_SCHEMA. Add it to required[] or optional[] ` +
                         `in src/lib/sqlite-bundle-contract.ts.`,
                });
            }
        }
        // Required columns missing from source
        for (const col of contract.required) {
            if (!sourceCols.includes(col)) {
                errors.push({
                    file: SRC,
                    msg: `Table ${t}: BUNDLE_SCHEMA marks '${col}' as required but the ` +
                         `CREATE TABLE statement does not emit it. Either add the column ` +
                         `to the CREATE TABLE or move it to optional[] in the contract.`,
                });
            }
        }
    }

    if (errors.length === 0) {
        console.log(
            `✓ Bundle schema contract OK — ${Object.keys(sourceTables).length} table(s) ` +
            `match BUNDLE_SCHEMA exactly.`,
        );
        process.exit(0);
    }

    console.log(`\n✗ Bundle schema drift detected (${errors.length} error(s)):\n`);
    for (const e of errors) {
        annotate(e.file, e.msg);
        console.log(`  • ${e.msg}`);
    }
    console.log(
        `\nFix by aligning CREATE TABLE in src/lib/sqlite-bundle.ts with ` +
        `BUNDLE_SCHEMA in src/lib/sqlite-bundle-contract.ts. Both must agree, ` +
        `or strict importers will silently accept (or reject) bundles.`,
    );
    process.exit(1);
}

main();
