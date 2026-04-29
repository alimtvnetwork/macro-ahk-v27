#!/usr/bin/env node
/**
 * compile-templates.mjs — HTML Template → JSON Registry Compiler
 *
 * Compiles HTML template files with {{variable}} syntax into a JSON registry.
 * Supports: {{var}}, {{#if cond}}...{{/if}}, {{#each items}}...{{/each}}, {{> partial}}
 *
 * Usage: node scripts/compile-templates.mjs <templatesDir> <outputFile>
 *
 * See: spec/16-standalone-script-assets-pipeline.md §5
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "fs";
import { join, basename, dirname, extname } from "path";

const [,, templatesDir, outputFile] = process.argv;

if (!templatesDir || !outputFile) {
    console.error("Usage: node compile-templates.mjs <templatesDir> <outputFile>");
    process.exit(1);
}

if (!existsSync(templatesDir)) {
    console.error(`Templates directory not found: ${templatesDir}`);
    process.exit(1);
}

/** Extract all {{variable}} names from template HTML (excludes syntax keywords). */
function extractVariables(html) {
    const vars = new Set();
    // Simple variables: {{varName}}
    const simplePattern = /\{\{(?!#|\/|>)(\w+)\}\}/g;
    let match;
    while ((match = simplePattern.exec(html)) !== null) {
        vars.add(match[1]);
    }
    // Conditional variables: {{#if varName}}
    const ifPattern = /\{\{#if\s+(\w+)\}\}/g;
    while ((match = ifPattern.exec(html)) !== null) {
        vars.add(match[1]);
    }
    // Each variables: {{#each varName}}
    const eachPattern = /\{\{#each\s+(\w+)\}\}/g;
    while ((match = eachPattern.exec(html)) !== null) {
        vars.add(match[1]);
    }
    return [...vars].sort();
}

/** Load partial templates from _partials/ subfolder. */
function loadPartials(dir) {
    const partialsDir = join(dir, "_partials");
    const partials = {};
    if (!existsSync(partialsDir)) return partials;

    for (const file of readdirSync(partialsDir)) {
        if (extname(file) !== ".html") continue;
        const name = basename(file, ".html");
        partials[name] = readFileSync(join(partialsDir, file), "utf-8").trim();
    }
    return partials;
}

/** Inline {{> partialName}} references. */
function resolvePartials(html, partials) {
    return html.replace(/\{\{>\s*(\w[\w-]*)\}\}/g, (_, name) => {
        if (partials[name]) return partials[name];
        console.warn(`  [warn] Partial "${name}" not found, leaving placeholder`);
        return `<!-- partial "${name}" not found -->`;
    });
}

// ── Main ──

const partials = loadPartials(templatesDir);
const registry = {};
let count = 0;

for (const file of readdirSync(templatesDir)) {
    if (extname(file) !== ".html") continue;
    if (file.startsWith("_")) continue; // Skip partials folder marker files

    const name = basename(file, ".html");
    const raw = readFileSync(join(templatesDir, file), "utf-8").trim();

    // Strip HTML comments (<!-- ... -->)
    const stripped = raw.replace(/<!--[\s\S]*?-->/g, "").trim();

    // Resolve partials
    const html = resolvePartials(stripped, partials);

    // Extract variables
    const variables = extractVariables(html);

    registry[name] = { html, variables };
    count++;
}

// Also register partials separately (prefixed with _)
for (const [name, html] of Object.entries(partials)) {
    const stripped = html.replace(/<!--[\s\S]*?-->/g, "").trim();
    registry[`_${name}`] = {
        html: stripped,
        variables: extractVariables(stripped),
    };
}

// Ensure output directory exists
const outDir = dirname(outputFile);
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

writeFileSync(outputFile, JSON.stringify(registry, null, 2) + "\n", "utf-8");
console.log(`[compile-templates] Compiled ${count} templates + ${Object.keys(partials).length} partials → ${outputFile}`);
