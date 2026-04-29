import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * Vite build config for the Lovable User Add standalone script.
 *
 * Output: standalone-scripts/lovable-user-add/dist/lovable-user-add.js
 */
export default defineConfig(({ mode }) => ({
    publicDir: false,
    build: {
        outDir: "standalone-scripts/lovable-user-add/dist",
        emptyOutDir: false,
        sourcemap: mode === "development" ? "inline" : false,
        minify: mode !== "development" ? "esbuild" : false,
        lib: {
            entry: resolve(__dirname, "standalone-scripts/lovable-user-add/src/index.ts"),
            name: "LovableUserAdd",
            formats: ["iife"],
            fileName: () => "lovable-user-add.js",
        },
        rollupOptions: {
            output: {
                inlineDynamicImports: true,
            },
        },
    },
    resolve: {
        alias: {
            "@lovable-user-add": resolve(__dirname, "standalone-scripts/lovable-user-add/src"),
            "@lovable-common": resolve(__dirname, "standalone-scripts/lovable-common/src"),
        },
    },
}));