import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * Vite build config for the Lovable Common standalone script.
 *
 * Compiles TypeScript source → single IIFE JS bundle exposing
 * window.LovableCommon (shared XPath/delay defaults + LovableApiClient
 * consumed by lovable-owner-switch and lovable-user-add).
 *
 * Output: standalone-scripts/lovable-common/dist/lovable-common.js
 *
 * Usage: pnpm run build:lovable-common
 *        pnpm run build:lovable-common -- --mode development
 */
export default defineConfig(({ mode }) => ({
    publicDir: false,
    build: {
        outDir: "standalone-scripts/lovable-common/dist",
        emptyOutDir: false,
        sourcemap: mode === "development" ? "inline" : false,
        minify: mode !== "development" ? "esbuild" : false,
        lib: {
            entry: resolve(__dirname, "standalone-scripts/lovable-common/src/index.ts"),
            name: "LovableCommon",
            formats: ["iife"],
            fileName: () => "lovable-common.js",
        },
        rollupOptions: {
            output: {
                inlineDynamicImports: true,
            },
        },
    },
    resolve: {
        alias: {
            "@lovable-common": resolve(__dirname, "standalone-scripts/lovable-common/src"),
        },
    },
}));