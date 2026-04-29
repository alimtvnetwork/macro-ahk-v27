import { defineConfig } from "vite";
import { resolve } from "path";

/**
 * Vite build config for the Payment Banner Hider standalone script.
 *
 * Compiles TypeScript source → single IIFE JS bundle exposing
 * window.PaymentBannerHider.
 *
 * Output: standalone-scripts/payment-banner-hider/dist/payment-banner-hider.js
 *
 * Usage: pnpm run build:payment-banner-hider
 *        pnpm run build:payment-banner-hider -- --mode development
 *
 * Dev mode: inline sourcemaps for readable injected stack traces.
 * Prod mode: no sourcemaps, esbuild-minified.
 */
export default defineConfig(({ mode }) => ({
    publicDir: false,
    build: {
        outDir: "standalone-scripts/payment-banner-hider/dist",
        emptyOutDir: false,
        sourcemap: mode === "development" ? "inline" : false,
        minify: mode !== "development" ? "esbuild" : false,
        lib: {
            entry: resolve(__dirname, "standalone-scripts/payment-banner-hider/src/index.ts"),
            name: "PaymentBannerHider",
            formats: ["iife"],
            fileName: () => "payment-banner-hider.js",
        },
        rollupOptions: {
            output: {
                inlineDynamicImports: true,
            },
        },
    },
    resolve: {
        alias: {
            "@payment-banner-hider": resolve(__dirname, "standalone-scripts/payment-banner-hider/src"),
        },
    },
}));
