import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * Vite build config for the Lovable Owner Switch standalone script.
 *
 * Output: standalone-scripts/lovable-owner-switch/dist/lovable-owner-switch.js
 */
export default defineConfig(({ mode }) => ({
    publicDir: false,
    build: {
        outDir: "standalone-scripts/lovable-owner-switch/dist",
        emptyOutDir: false,
        sourcemap: mode === "development" ? "inline" : false,
        minify: mode !== "development" ? "esbuild" : false,
        lib: {
            entry: resolve(__dirname, "standalone-scripts/lovable-owner-switch/src/index.ts"),
            name: "LovableOwnerSwitch",
            formats: ["iife"],
            fileName: () => "lovable-owner-switch.js",
        },
        rollupOptions: {
            output: {
                inlineDynamicImports: true,
            },
        },
    },
    resolve: {
        alias: {
            "@lovable-owner-switch": resolve(__dirname, "standalone-scripts/lovable-owner-switch/src"),
            "@lovable-common": resolve(__dirname, "standalone-scripts/lovable-common/src"),
        },
    },
}));