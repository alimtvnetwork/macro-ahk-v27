/**
 * TEMPLATE — spec/26-chrome-extension-generic/12-templates/vite.config.template.ts
 *
 * Purpose: Vite config for the main extension bundle (background SW, content
 *          script, options page, popup). Produces flat, MV3-compatible artifacts
 *          in `dist/`.
 *
 * Last reviewed: 2026-04-24
 *
 * Tokens to replace before use:
 *   <PROJECT_NAME> — human-readable extension name
 *   <VERSION>      — semver string
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs";

const isProd = process.env.NODE_ENV === "production";

export default defineConfig({
    plugins: [
        react(),
        {
            name: "<PROJECT_NAME>-mv3-bundle",
            apply: "build",
            writeBundle() {
                const distDir = path.resolve(__dirname, "dist");
                if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

                // 1. Copy MV3 manifest verbatim — Vite must not transform it.
                copyFileSync(
                    path.resolve(__dirname, "manifest.json"),
                    path.resolve(distDir, "manifest.json"),
                );

                // 2. Emit version.txt for the release-zip contract checker.
                writeFileSync(
                    path.resolve(distDir, "version.txt"),
                    "<VERSION>\n",
                    "utf8",
                );
            },
        },
    ],

    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
            "@background": path.resolve(__dirname, "src/background"),
            "@content": path.resolve(__dirname, "src/content"),
            "@options": path.resolve(__dirname, "src/options"),
            "@popup": path.resolve(__dirname, "src/popup"),
            "@shared": path.resolve(__dirname, "src/shared"),
            "@platform": path.resolve(__dirname, "src/platform"),
        },
    },

    build: {
        target: "es2022",
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: isProd ? false : "inline", // dev: inline; prod: none (mem://architecture/sourcemap-strategy)
        minify: isProd ? "esbuild" : false,
        cssCodeSplit: false,
        rollupOptions: {
            input: {
                background: path.resolve(__dirname, "src/background/index.ts"),
                content: path.resolve(__dirname, "src/content/index.ts"),
                options: path.resolve(__dirname, "options.html"),
                popup: path.resolve(__dirname, "popup.html"),
            },
            output: {
                entryFileNames: "[name].js",
                chunkFileNames: "chunks/[name]-[hash].js",
                assetFileNames: "assets/[name]-[hash][extname]",
                format: "es",
            },
        },
    },

    server: {
        port: 5173,
        strictPort: true,
    },
});
