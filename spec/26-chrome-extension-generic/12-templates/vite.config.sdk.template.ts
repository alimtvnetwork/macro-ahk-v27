/**
 * TEMPLATE — spec/26-chrome-extension-generic/12-templates/vite.config.sdk.template.ts
 *
 * Purpose: Vite config for the page-injected SDK. Produces a single IIFE bundle
 *          named `sdk.iife.js` that the content script injects into the MAIN
 *          world via `chrome.scripting.executeScript`.
 *
 * Last reviewed: 2026-04-24
 *
 * Tokens to replace before use:
 *   <ROOT_NAMESPACE> — JS global the IIFE attaches to (e.g., MyExtNamespace)
 *   <VERSION>        — semver string emitted into the bundle banner
 */

import { defineConfig } from "vite";
import path from "node:path";

const isProd = process.env.NODE_ENV === "production";

export default defineConfig({
    build: {
        target: "es2022",
        outDir: "dist",
        emptyOutDir: false,
        sourcemap: isProd ? false : "inline",
        minify: isProd ? "esbuild" : false,
        lib: {
            entry: path.resolve(__dirname, "standalone-scripts/sdk/src/index.ts"),
            name: "<ROOT_NAMESPACE>",
            formats: ["iife"],
            fileName: () => "sdk.iife.js",
        },
        rollupOptions: {
            output: {
                extend: true, // attach to existing window.<ROOT_NAMESPACE> if present
                banner: "/* <ROOT_NAMESPACE> SDK v<VERSION> — built " + new Date().toISOString() + " */",
            },
        },
    },
});
