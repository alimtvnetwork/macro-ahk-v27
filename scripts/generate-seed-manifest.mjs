#!/usr/bin/env node
/**
 * generate-seed-manifest.mjs
 *
 * Scans all standalone-scripts/<name>/dist/instruction.json files (per-project
 * build outputs) and produces a single seed-manifest.json that the extension
 * seeder reads at runtime from the unpacked extension root.
 *
 * instruction.json is the SOLE source of truth — script-manifest.json
 * is no longer required.
 *
 * ── PascalCase storage layer (Phase 2c) ──
 *
 * The emitted seed-manifest.json uses PascalCase keys end-to-end,
 * matching `ProjectInstruction` / `SeedManifest` (TS type). The reader
 * below requires the input `instruction.json` to be the canonical
 * PascalCase artifact emitted by `scripts/compile-instruction.mjs`
 * (Phase 2b) — no camelCase fallback. The transitional
 * `instruction.compat.json` is consumed only by the vite copy plugin.
 *
 * SchemaVersion is pinned to 2: PascalCase rename. The runtime seeder
 * (`src/background/manifest-seeder.ts`) only accepts v2; v1
 * (camelCase) was removed alongside this script's compat read.
 *
 * Usage:
 *   node scripts/generate-seed-manifest.mjs [--out <path>]
 *
 * Default output: chrome-extension/projects/seed-manifest.json
 *   (the unpacked extension folder loaded into Chrome).
 * Also writes to: standalone-scripts/_generated/seed-manifest.json (for reference)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const STANDALONE_DIR = join(ROOT, "standalone-scripts");

/** Pinned to 2 when PascalCase rename landed (Phase 2a). v1 (camelCase)
 * is no longer emitted; v1 manifests are not accepted by the runtime
 * seeder either (see manifest-seeder.ts SUPPORTED_SCHEMA_VERSIONS). */
const SCHEMA_VERSION = 2;

/* ------------------------------------------------------------------ */
/*  Reader — PascalCase only                                            */
/*                                                                      */
/*  Phase 2c (storage layer) requires the input instruction.json to be  */
/*  the canonical PascalCase artifact emitted by compile-instruction.   */
/*  No camelCase fallback. A missing key is a hard error visible in the */
/*  build log; do NOT add `pick(obj, "Pascal", "camel")` lenience here. */
/* ------------------------------------------------------------------ */

/** Read a required PascalCase key. Throws with a precise location if missing/undefined. */
function need(obj, key, location) {
    if (!obj || typeof obj !== "object") {
        throw new Error(`[generate-seed-manifest] ${location}: expected object, got ${typeof obj}`);
    }
    if (!(key in obj) || obj[key] === undefined) {
        throw new Error(
            `[generate-seed-manifest] ${location}: missing required PascalCase key "${key}". ` +
            `Re-run \`node scripts/compile-instruction.mjs <project>\` to regenerate ` +
            `instruction.json from the source instruction.ts.`,
        );
    }
    return obj[key];
}

/** Read an optional PascalCase key. Returns the value or `fallback` (default undefined). */
function opt(obj, key, fallback = undefined) {
    if (!obj || typeof obj !== "object") return fallback;
    return key in obj && obj[key] !== undefined ? obj[key] : fallback;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

function main() {
    const outArg = process.argv.indexOf("--out");
    const defaultOut = join(ROOT, "chrome-extension", "projects", "seed-manifest.json");
    const outPath = outArg !== -1 ? resolve(process.argv[outArg + 1]) : defaultOut;


    if (!existsSync(STANDALONE_DIR)) {
        console.error("❌ standalone-scripts/ directory not found");
        process.exit(1);
    }

    const folders = readdirSync(STANDALONE_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith("_") && d.name !== "prompts");

    const projects = [];

    for (const folder of folders) {
        const name = folder.name;
        const projectDir = join(STANDALONE_DIR, name);
        const sourceInstructionPath = join(projectDir, "src", "instruction.ts");
        const instructionPath = join(STANDALONE_DIR, name, "dist", "instruction.json");

        ensureFreshInstructionJson(name, projectDir, sourceInstructionPath, instructionPath);

        if (!existsSync(instructionPath)) {
            console.warn(`⚠ Skipping ${name}: no dist/instruction.json (run compile-instruction first)`);
            continue;
        }

        const instruction = JSON.parse(readFileSync(instructionPath, "utf-8"));
        const projectEntry = buildProjectEntry(name, instruction);
        projects.push(projectEntry);
    }

    // Sort by LoadOrder (PascalCase)
    projects.sort((a, b) => a.LoadOrder - b.LoadOrder);

    const manifest = {
        GeneratedAt: new Date().toISOString(),
        SchemaVersion: SCHEMA_VERSION,
        Projects: projects,
    };

    const json = JSON.stringify(manifest, null, 2) + "\n";

    // Write to output path
    mkdirSync(resolve(outPath, ".."), { recursive: true });
    writeFileSync(outPath, json, "utf-8");
    console.log(`✅ seed-manifest.json → ${outPath} (${projects.length} projects, schema v${SCHEMA_VERSION})`);

    // Also write a reference copy alongside standalone-scripts
    const refDir = join(STANDALONE_DIR, "_generated");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(join(refDir, "seed-manifest.json"), json, "utf-8");
}

function ensureFreshInstructionJson(name, projectDir, sourceInstructionPath, instructionPath) {
    const sourceExists = existsSync(sourceInstructionPath);
    const distExists = existsSync(instructionPath);

    if (!sourceExists) {
        return;
    }

    const shouldCompile = !distExists || statSync(sourceInstructionPath).mtimeMs > statSync(instructionPath).mtimeMs;
    if (!shouldCompile) {
        return;
    }

    const relativeProjectDir = projectDir.replace(ROOT + "/", "");
    console.log(`↻ Refreshing stale instruction.json for ${name}`);
    execFileSync(process.execPath, [join(ROOT, "scripts", "compile-instruction.mjs"), relativeProjectDir], {
        cwd: ROOT,
        stdio: "inherit",
    });
}

/* ------------------------------------------------------------------ */
/*  Builder                                                            */
/* ------------------------------------------------------------------ */

function buildProjectEntry(name, instruction) {
    const basePath = `projects/scripts/${name}`;
    const where = `instruction.json[${name}]`;

    // Read seed + assets blocks. Required at the top level so a malformed
    // instruction.json fails the build with a precise message instead of
    // silently producing an empty project entry.
    const seed = need(instruction, "Seed", where);
    const assets = need(instruction, "Assets", where);

    const displayName = opt(instruction, "DisplayName", name);
    const version = opt(instruction, "Version", "1.0.0");
    const description = opt(instruction, "Description", "");
    const world = opt(instruction, "World", "MAIN");
    const loadOrder = opt(instruction, "LoadOrder", 99);
    const isGlobal = opt(instruction, "IsGlobal", false) === true;
    const dependencies = opt(instruction, "Dependencies", []);

    const seedId = opt(seed, "Id", `default-${name}`);
    const seedOnInstall = opt(seed, "SeedOnInstall", true);
    const isRemovable = opt(seed, "IsRemovable", true);
    const seedRunAt = opt(seed, "RunAt");
    const seedAutoInject = opt(seed, "AutoInject", true);
    const seedCookieBinding = opt(seed, "CookieBinding");
    const configSeedIds = opt(seed, "ConfigSeedIds", {});

    // Build script entries from Assets.Scripts. `File` is required per
    // entry — without it we cannot build a FilePath the seeder can fetch.
    const scripts = [];
    const scriptAssets = opt(assets, "Scripts", []);
    for (const s of scriptAssets) {
        const file = need(s, "File", `${where}.Assets.Scripts[]`);
        scripts.push({
            SeedId: seedId,
            File: file,
            FilePath: `${basePath}/${file}`,
            Order: opt(s, "Order", 0),
            IsIife: opt(s, "IsIife", true),
            ConfigBinding: opt(s, "ConfigBinding"),
            ThemeBinding: opt(s, "ThemeBinding"),
            CookieBinding: seedCookieBinding,
            RunAt: seedRunAt,
            Description: description,
            AutoInject: seedAutoInject,
        });
    }

    // Build config entries from Assets.Configs. `File` and `Key` are required.
    const configs = [];
    const configAssets = opt(assets, "Configs", []);
    for (const c of configAssets) {
        const file = need(c, "File", `${where}.Assets.Configs[]`);
        const key = need(c, "Key", `${where}.Assets.Configs[]`);
        configs.push({
            SeedId: configSeedIds[key] || `default-${name}-${key}`,
            File: file,
            FilePath: `${basePath}/${file}`,
            Key: key,
            InjectAs: opt(c, "InjectAs"),
            Description: `${key} config for ${displayName}`,
        });
    }

    // Build CSS entries
    const cssAssets = opt(assets, "Css", []);
    const css = cssAssets.map((c) => {
        const file = need(c, "File", `${where}.Assets.Css[]`);
        return {
            File: file,
            FilePath: `${basePath}/${file}`,
            Inject: opt(c, "Inject", "head"),
        };
    });

    // Build template entries
    const templateAssets = opt(assets, "Templates", []);
    const templates = templateAssets.map((t) => {
        const file = need(t, "File", `${where}.Assets.Templates[]`);
        return {
            File: file,
            FilePath: `${basePath}/${file}`,
            InjectAs: opt(t, "InjectAs"),
        };
    });

    // Build prompt entries
    const promptAssets = opt(assets, "Prompts", []);
    const prompts = promptAssets.map((p) => {
        const file = need(p, "File", `${where}.Assets.Prompts[]`);
        return {
            File: file,
            FilePath: `${basePath}/${file}`,
        };
    });

    // TargetUrls / Cookies / Settings — pure PascalCase, no fallback.
    const targetUrlsRaw = opt(seed, "TargetUrls", []);
    const targetUrls = targetUrlsRaw.map((u) => ({
        Pattern: need(u, "Pattern", `${where}.Seed.TargetUrls[]`),
        MatchType: need(u, "MatchType", `${where}.Seed.TargetUrls[]`),
    }));

    const cookiesRaw = opt(seed, "Cookies", []);
    const cookies = cookiesRaw.map((c) => ({
        CookieName: need(c, "CookieName", `${where}.Seed.Cookies[]`),
        Url: need(c, "Url", `${where}.Seed.Cookies[]`),
        Role: need(c, "Role", `${where}.Seed.Cookies[]`),
        Description: opt(c, "Description", ""),
    }));

    const settings = opt(seed, "Settings", {});

    return {
        Name: name,
        DisplayName: displayName,
        Version: version,
        Description: description,
        SeedId: seedId,
        SeedOnInstall: seedOnInstall,
        World: world,
        LoadOrder: loadOrder,
        IsGlobal: isGlobal,
        IsRemovable: isRemovable,
        Dependencies: dependencies,
        Scripts: scripts,
        Configs: configs,
        Css: css,
        Templates: templates,
        Prompts: prompts,
        TargetUrls: targetUrls,
        Cookies: cookies,
        Settings: settings,
    };
}

main();
