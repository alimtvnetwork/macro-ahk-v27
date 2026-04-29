/**
 * Marco Extension — Root Vite Build Config
 *
 * Builds the Chrome extension from root src/ (React popup)
 * and chrome-extension/src/ (background SW, options page).
 *
 * Usage: npx vite build --config vite.config.extension.ts
 */

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { visualizer } from "rollup-plugin-visualizer";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "path";
import {
    copyFileSync,
    mkdirSync,
    existsSync,
    readFileSync,
    writeFileSync,
    readdirSync,
} from "fs";
import { execSync } from "node:child_process";

const EXT_DIR = __dirname;
// NOTE: The unpacked Chrome extension is written DIRECTLY into ./chrome-extension/
// at the repo root (load-unpacked target). This replaces the legacy ./dist/ output.
// dist/ is reserved for the Lovable preview / web-app build (`vite build` without
// --config). Both the build script and PowerShell deploy modules read this path
// from powershell.json -> distDir = "chrome-extension".
const DIST_DIR = resolve(__dirname, "chrome-extension");

function resolveDeclaredAssetSource(
    projectRootDir: string,
    projectDistDir: string,
    fileName: string,
    assetKey?: string,
): string | null {
    const directCandidates = [
        resolve(projectDistDir, fileName),
        resolve(projectRootDir, fileName),
    ];

    for (const candidate of directCandidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    const rootFiles = existsSync(projectRootDir)
        ? readdirSync(projectRootDir).filter((file) => !file.startsWith("."))
        : [];
    const normalizedFileName = fileName.toLowerCase();
    const prefixedMatch = rootFiles.find((file) => file.toLowerCase().endsWith(`-${normalizedFileName}`));

    if (prefixedMatch) {
        return resolve(projectRootDir, prefixedMatch);
    }

    if (assetKey === "config") {
        const configMatch = rootFiles.find(
            (file) => /\.json$/i.test(file)
                && /config/i.test(file)
                && !/instruction|theme|prompt/i.test(file),
        );
        if (configMatch) {
            return resolve(projectRootDir, configMatch);
        }
    }

    if (assetKey === "theme") {
        const themeMatch = rootFiles.find(
            (file) => /\.json$/i.test(file) && /theme/i.test(file),
        );
        if (themeMatch) {
            return resolve(projectRootDir, themeMatch);
        }
    }

    return null;
}

/* ------------------------------------------------------------------ */
/*  Plugins                                                            */
/* ------------------------------------------------------------------ */

/**
 * Copies and rewrites manifest.json to chrome-extension/.
 *
 * IMPORTANT: This plugin merges path overrides into the source manifest
 * rather than wholesale-replacing fields. Previously it overwrote
 * `web_accessible_resources` with a shorter list, dropping the
 * content-script entries (xpath-recorder, network-reporter, prompt-injector)
 * — that broke recorder injection silently. The source manifest is now the
 * single source of truth for resource lists; this plugin only rewrites
 * the entry-point path fields.
 */
function copyManifest(): Plugin {
    return {
        name: "copy-manifest",
        writeBundle() {
            mkdirSync(DIST_DIR, { recursive: true });

            const manifest = JSON.parse(
                readFileSync(resolve(EXT_DIR, "manifest.json"), "utf-8"),
            );

            manifest.background.service_worker = "background/index.js";
            manifest.action.default_popup = "src/popup/popup.html";
            manifest.action.default_icon = {
                "16": "assets/icons/icon-16.png",
                "48": "assets/icons/icon-48.png",
                "128": "assets/icons/icon-128.png",
            };
            manifest.options_page = "src/options/options.html";
            manifest.icons = {
                "16": "assets/icons/icon-16.png",
                "48": "assets/icons/icon-48.png",
                "128": "assets/icons/icon-128.png",
            };
            // NOTE: web_accessible_resources is taken verbatim from the source
            // manifest.json — do NOT overwrite here. The source manifest already
            // lists wasm/sql-wasm.wasm, build-meta.json, prompts, projects/*,
            // and the three content-script JS bundles.

            writeFileSync(
                resolve(DIST_DIR, "manifest.json"),
                JSON.stringify(manifest, null, 2),
            );
        },
    };
}

/**
 * Hard-fails the build if wasm/sql-wasm.wasm is missing from the output.
 *
 * The SQLite WASM binary is the single most critical runtime asset — without
 * it, the background service worker fails at boot (step "db-init") with a
 * cryptic fetch error. We verify it landed in DIST_DIR before declaring the
 * build complete so a misconfigured viteStaticCopy target or an emptyOutDir
 * regression cannot ship a broken bundle silently.
 */
function verifyWasmAsset(): Plugin {
    return {
        name: "verify-wasm-asset",
        // Use closeBundle so we run AFTER viteStaticCopy + copyManifest.
        closeBundle() {
            const wasmPath = resolve(DIST_DIR, "wasm", "sql-wasm.wasm");
            const sourcePath = resolve(EXT_DIR, "node_modules", "sql.js", "dist", "sql-wasm.wasm");

            if (existsSync(wasmPath)) {
                return;
            }

            // Self-heal: copy directly from node_modules if viteStaticCopy didn't.
            if (existsSync(sourcePath)) {
                mkdirSync(resolve(DIST_DIR, "wasm"), { recursive: true });
                copyFileSync(sourcePath, wasmPath);
                console.log(`[verify-wasm-asset] Self-healed: copied sql-wasm.wasm to ${wasmPath}`);
                return;
            }

            throw new Error(
                [
                    "[verify-wasm-asset] HARD ERROR — sql-wasm.wasm missing from build output.",
                    `  expected at: ${wasmPath}`,
                    `  source path: ${sourcePath} (also missing — run pnpm install)`,
                    "  reason: SQLite cannot initialize without the WASM binary; the extension would fail at boot step 'db-init'.",
                ].join("\n"),
            );
        },
    };
}

/**
 * Copies icon assets to chrome-extension/assets/icons/.
 *
 * If a specific size (e.g. icon-16.png) is missing on disk, falls back to the
 * largest available icon for that filename. This keeps the manifest valid on a
 * fresh checkout where only icon-128.png has been committed; Chrome will
 * downscale at display time. The fallback is logged so a real asset can be
 * supplied later.
 *
 * Hard-fails ONLY when no icon at any size is available — we cannot fabricate
 * an image.
 */
function copyIcons(): Plugin {
    return {
        name: "copy-icons",
        writeBundle() {
            const destDir = resolve(DIST_DIR, "assets", "icons");
            const srcDir = resolve(EXT_DIR, "src", "assets", "icons");

            mkdirSync(destDir, { recursive: true });

            const sizes = ["16", "48", "128"];

            // Pick fallback source: largest existing icon, else public/favicon.png.
            const orderedFallbacks = [...sizes].reverse().map((s) => resolve(srcDir, `icon-${s}.png`));
            orderedFallbacks.push(resolve(EXT_DIR, "public", "favicon.png"));

            const fallbackSource = orderedFallbacks.find((p) => existsSync(p)) ?? null;

            if (!fallbackSource) {
                throw new Error(
                    [
                        "[copy-icons] HARD ERROR — no icon source available.",
                        `  searched src dir: ${srcDir}`,
                        `  searched fallback: ${resolve(EXT_DIR, "public", "favicon.png")}`,
                        "  reason: at least one of icon-16/48/128.png or public/favicon.png must exist.",
                    ].join("\n"),
                );
            }

            for (const size of sizes) {
                const filename = `icon-${size}.png`;
                const srcPath = resolve(srcDir, filename);
                const destPath = resolve(destDir, filename);

                if (existsSync(srcPath)) {
                    copyFileSync(srcPath, destPath);
                    continue;
                }

                copyFileSync(fallbackSource, destPath);
                console.warn(
                    `[copy-icons] WARN — ${filename} missing at ${srcPath}; ` +
                        `falling back to ${fallbackSource}. Add a real ${size}x${size} PNG to silence this.`,
                );
            }
        },
    };
}

/**
 * Validates no dynamic import() in the background bundle.
 * Service workers cannot use dynamic imports.
 */
function validateNoBackgroundDynamicImport(): Plugin {
    return {
        name: "validate-no-bg-dynamic-import",
        writeBundle() {
            const bgDir = resolve(DIST_DIR, "background");

            if (!existsSync(bgDir)) {
                return;
            }

            const jsFiles = readdirSync(bgDir).filter((f) => f.endsWith(".js"));
            const violations: string[] = [];

            // Strips JS string literals, template literals, and comments so the
            // dynamic-import scan does not false-positive on text like
            //   "Trailing comma is not allowed in import()"
            // which acorn ships as an error message constant.
            const stripStringsAndComments = (src: string): string => {
                let out = "";
                let i = 0;
                const n = src.length;
                while (i < n) {
                    const ch = src[i];
                    const next = src[i + 1];
                    // Line comment
                    if (ch === "/" && next === "/") {
                        while (i < n && src[i] !== "\n") i++;
                        continue;
                    }
                    // Block comment
                    if (ch === "/" && next === "*") {
                        i += 2;
                        while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
                        i += 2;
                        continue;
                    }
                    // String / template literal
                    if (ch === '"' || ch === "'" || ch === "`") {
                        const quote = ch;
                        i++;
                        while (i < n) {
                            if (src[i] === "\\") { i += 2; continue; }
                            if (src[i] === quote) { i++; break; }
                            i++;
                        }
                        out += " ";
                        continue;
                    }
                    out += ch;
                    i++;
                }
                return out;
            };

            for (const file of jsFiles) {
                const raw = readFileSync(resolve(bgDir, file), "utf-8");
                const content = stripStringsAndComments(raw);
                const dynamicImportPattern = /(?<![\w$])import\s*\(/g;
                const matches = [...content.matchAll(dynamicImportPattern)];

                if (matches.length > 0) {
                    violations.push(
                        `  ✗ background/${file}: ${matches.length} dynamic import() call(s)`,
                    );
                }
            }

            if (violations.length > 0) {
                throw new Error(
                    [
                        "",
                        "╔══════════════════════════════════════════════════════════════╗",
                        "║  BUILD FAILED: Dynamic import() in background bundle       ║",
                        "╚══════════════════════════════════════════════════════════════╝",
                        "",
                        ...violations,
                        "",
                    ].join("\n"),
                );
            }
        },
    };
}

/** Generates build-meta.json for hot-reload detection. */
function generateBuildMeta(): Plugin {
    return {
        name: "generate-build-meta",
        writeBundle() {
            mkdirSync(DIST_DIR, { recursive: true });

            writeFileSync(
                resolve(DIST_DIR, "build-meta.json"),
                JSON.stringify({
                    buildId: Math.random().toString(36).slice(2, 10),
                    timestamp: new Date().toISOString(),
                    freshStart: true,
                }, null, 2),
            );
        },
    };
}

/** Re-aggregates prompts AFTER emptyOutDir wipes the output, then copies into chrome-extension/prompts/. */
function copyPrompts(): Plugin {
    return {
        name: "copy-prompts",
        writeBundle() {
            try {
                execSync(
                    `node scripts/aggregate-prompts.mjs`,
                    { cwd: __dirname, stdio: "inherit" },
                );
                // aggregate-prompts.mjs writes into chrome-extension/prompts/ directly,
                // so this copy step is a no-op when src===dest, but we keep the explicit
                // copy as a safety net for the case where a future contributor changes
                // the aggregator's output directory.
                const src = resolve(DIST_DIR, "prompts", "macro-prompts.json");
                if (existsSync(src)) {
                    const destDir = resolve(DIST_DIR, "prompts");
                    mkdirSync(destDir, { recursive: true });
                    if (resolve(src) !== resolve(destDir, "macro-prompts.json")) {
                        copyFileSync(src, resolve(destDir, "macro-prompts.json"));
                    }
                }
            } catch (e) {
                console.warn("[copy-prompts] failed:", e);
            }
        },
    };
}

/**
 * Copies compiled standalone scripts into chrome-extension/projects/scripts/{project-name}/.
 * Reads each project's standalone-scripts/<name>/dist/instruction.json for asset metadata.
 * instruction.json is the sole source of truth — script-manifest.json is not required.
 */
function copyProjectScripts(): Plugin {
    return {
        name: "copy-project-scripts",
        writeBundle() { // eslint-disable-line sonarjs/cognitive-complexity -- build plugin with filesystem branching
            const projectsBaseDir = resolve(DIST_DIR, "projects", "scripts");
            mkdirSync(projectsBaseDir, { recursive: true });

            const standaloneDir = resolve(__dirname, "standalone-scripts");
            if (!existsSync(standaloneDir)) return;

            const scriptFolders = readdirSync(standaloneDir, { withFileTypes: true })
                .filter((d) => d.isDirectory());

            let copiedCount = 0;

            for (const folder of scriptFolders) {
                const projectRootDir = resolve(standaloneDir, folder.name);
                const sourceInstructionPath = resolve(projectRootDir, "src", "instruction.ts");
                const instructionPath = resolve(projectRootDir, "dist", "instruction.json");
                // Phase 2b: this plugin still reads camelCase keys
                // (`assets.configs`, `displayName`, `version`). It therefore
                // consumes the transitional camelCase compat snapshot
                // emitted alongside the canonical PascalCase file by
                // scripts/compile-instruction.mjs. Phase 2c will migrate
                // this plugin to PascalCase and drop the compat read.
                const instructionCompatPath = resolve(projectRootDir, "dist", "instruction.compat.json");

                if (!existsSync(instructionPath) && existsSync(sourceInstructionPath)) {
                    try {
                        execSync(
                            `node scripts/compile-instruction.mjs "standalone-scripts/${folder.name}"`,
                            { cwd: __dirname, stdio: "inherit" },
                        );
                    } catch (e) {
                        console.warn(`[copy-project-scripts] Failed to compile instruction for ${folder.name}: ${e}`);
                    }
                }

                if (!existsSync(instructionPath)) continue;

                try {
                    // Read the camelCase compat snapshot for this plugin's
                    // legacy key access. Fall back to the canonical file
                    // ONLY for top-level pass-through if the compat file
                    // is somehow missing (e.g. stale dist from before
                    // Phase 2b) — in that case the canonical PascalCase
                    // shape will fail the camelCase reads below and
                    // surface a clear error.
                    const instructionForCamelReads = existsSync(instructionCompatPath)
                        ? JSON.parse(readFileSync(instructionCompatPath, "utf-8"))
                        : JSON.parse(readFileSync(instructionPath, "utf-8"));
                    const distDir = resolve(projectRootDir, "dist");

                    // Per-project subfolder
                    const projectDir = resolve(projectsBaseDir, folder.name);
                    mkdirSync(projectDir, { recursive: true });

                    // Copy ALL dist/ artifacts into the project subfolder.
                    // This includes BOTH `instruction.json` (canonical
                    // PascalCase) and `instruction.compat.json` (camelCase
                    // transitional snapshot), so consumers reading either
                    // shape from web_accessible_resources keep working.
                    if (existsSync(distDir)) {
                        const distFiles = readdirSync(distDir).filter(
                            (f) => !f.startsWith("."),
                        );
                        for (const distFile of distFiles) {
                            const src = resolve(distDir, distFile);
                            const dest = resolve(projectDir, distFile);
                            copyFileSync(src, dest);
                            console.log(`[copy-project-scripts]   + ${folder.name}/${distFile}`);
                        }
                    }

                    const declaredAssets = [
                        ...(instructionForCamelReads.assets?.configs ?? []),
                        ...(instructionForCamelReads.assets?.templates ?? []),
                        ...(instructionForCamelReads.assets?.prompts ?? []),
                        ...(instructionForCamelReads.assets?.css ?? []),
                        ...(instructionForCamelReads.assets?.scripts ?? []),
                    ] as Array<{ file: string; key?: string }>;

                    for (const asset of declaredAssets) {
                        const dest = resolve(projectDir, asset.file);
                        if (existsSync(dest)) {
                            continue;
                        }

                        const source = resolveDeclaredAssetSource(
                            projectRootDir,
                            distDir,
                            asset.file,
                            asset.key,
                        );

                        if (!source) {
                            console.warn(`[copy-project-scripts] Missing declared asset for ${folder.name}: ${asset.file}`);
                            continue;
                        }

                        copyFileSync(source, dest);
                        console.log(`[copy-project-scripts]   + ${folder.name}/${asset.file} (declared asset)`);
                    }

                    // Copy the canonical instruction.json itself (the
                    // dist-loop above already copied it, but the explicit
                    // copy here guarantees presence even if dist was empty
                    // when the loop ran).
                    copyFileSync(instructionPath, resolve(projectDir, "instruction.json"));

                    copiedCount++;
                    console.log(`[copy-project-scripts] ✓ ${folder.name} (${instructionForCamelReads.displayName || folder.name} v${instructionForCamelReads.version || "?"})`);
                } catch (e) {
                    console.warn(`[copy-project-scripts] Failed to process ${folder.name}: ${e}`);
                }
            }

            if (copiedCount > 0) {
                console.log(`[copy-project-scripts] Copied ${copiedCount} project(s) to chrome-extension/projects/scripts/`);
            }

            // Regenerate seed-manifest.json AFTER emptyOutDir cleanup + project copy.
            // This is the runtime source the background seeder reads.
            try {
                execSync(
                    `node scripts/generate-seed-manifest.mjs --out "${resolve(DIST_DIR, "projects", "seed-manifest.json")}"`,
                    { cwd: __dirname, stdio: "inherit" },
                );
            } catch (e) {
                console.warn("[copy-project-scripts] seed-manifest.json generation failed:", e);
            }
        },
    };
}

/**
 * Copies the existing options page (plain HTML) to chrome-extension/.
 * This preserves the current options page until it's migrated to React.
 */
function copyLegacyOptions(): Plugin {
    return {
        name: "copy-legacy-options",
        writeBundle() {
            const srcOptions = resolve(EXT_DIR, "src", "options");
            const destOptions = resolve(DIST_DIR, "src", "options");

            if (!existsSync(srcOptions)) {
                return;
            }

            mkdirSync(destOptions, { recursive: true });

            // The options page is built by the original extension vite config.
            // For this PoC we only need the popup to be React.
            // The options_page manifest path points to the original built location.
        },
    };
}

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

export default defineConfig(({ mode }) => {
    const isDev = mode === "development";

    return {
        base: "./",
        plugins: [
            react(),
            viteStaticCopy({
                targets: [
                    {
                        src: "node_modules/sql.js/dist/sql-wasm.wasm",
                        dest: "wasm",
                    },
                ],
            }),
            copyPrompts(),
            copyManifest(),
            copyIcons(),
            validateNoBackgroundDynamicImport(),
            // Always emit build-meta.json — manifest.json declares it as a
            // web-accessible resource, so the post-build manifest path
            // validator fails if it is missing. Hot-reload polling is gated
            // separately on `manifest.version_name` containing "dev"
            // (see src/background/hot-reload.ts), so emitting the file in
            // production does NOT keep the SW awake.
            generateBuildMeta(),
            copyProjectScripts(),
            verifyWasmAsset(),
            // Bundle visualizer — gated behind ANALYZE=1 to keep the output slim.
            // Run `ANALYZE=1 pnpm run build:extension` to generate bundle-report.html.
            process.env.ANALYZE === "1"
                ? (visualizer({
                      filename: resolve(DIST_DIR, "bundle-report.html"),
                      template: "treemap",
                      gzipSize: true,
                      brotliSize: false,
                  }) as unknown as Plugin)
                : null,
        ].filter(Boolean) as Plugin[],
        build: {
            outDir: DIST_DIR,
            emptyOutDir: true,
            sourcemap: mode === 'development' ? 'inline' : false,
            minify: false,
            modulePreload: false,
            rollupOptions: {
                input: {
                    "background/index": resolve(
                        __dirname,
                        "src/background/index.ts",
                    ),
                    "popup/popup": resolve(
                        __dirname,
                        "src/popup/popup.html",
                    ),
                    "options/options": resolve(
                        __dirname,
                        "src/options/options.html",
                    ),
                    "content-scripts/xpath-recorder": resolve(
                        __dirname,
                        "src/content-scripts/xpath-recorder.ts",
                    ),
                    "content-scripts/network-reporter": resolve(
                        __dirname,
                        "src/content-scripts/network-reporter.ts",
                    ),
                    "content-scripts/message-relay": resolve(
                        __dirname,
                        "src/content-scripts/message-relay.ts",
                    ),
                    "content-scripts/prompt-injector": resolve(
                        __dirname,
                        "src/content-scripts/prompt-injector.ts",
                    ),
                },
                output: {
                    entryFileNames: "[name].js",
                    chunkFileNames: "chunks/[name]-[hash].js",
                    assetFileNames: "assets/[name]-[hash][extname]",
                    manualChunks(id) {
                        // Force ALL modules imported by the background entry
                        // into the background bundle to prevent dynamic import()
                        // in the service worker context.
                        const isBackgroundCode =
                            id.includes("/src/background/");

                        if (isBackgroundCode) {
                            return "background/index";
                        }

                        // Shared modules used by background must also be inlined.
                        const isSharedModule =
                            id.includes("/src/shared/");

                        if (isSharedModule) {
                            return "background/index";
                        }

                        // The background preflights user-script syntax with
                        // Acorn because MV3 extension pages cannot use eval or
                        // new Function(). Keep the parser inside the service
                        // worker bundle so no split chunk import is emitted.
                        const isBackgroundParser = id.includes("/node_modules/acorn/");

                        if (isBackgroundParser) {
                            return "background/index";
                        }
                    },
                },
            },
        },
        resolve: {
            alias: {
                // Shared React UI and routes use @/ for the root src/ tree.
                "@/": resolve(__dirname, "src") + "/",
                // Extension-only source remains available via @ext/.
                "@ext/": resolve(EXT_DIR, "src") + "/",
                "@root/": resolve(__dirname, "src") + "/",
                "@standalone": resolve(__dirname, "standalone-scripts"),
            },
        },
    };
});
