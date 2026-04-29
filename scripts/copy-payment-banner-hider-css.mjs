#!/usr/bin/env node
/**
 * Copy standalone-scripts/payment-banner-hider/css/payment-banner-hider.css
 * → standalone-scripts/payment-banner-hider/dist/payment-banner-hider.css
 *
 * Sibling pattern to scripts/compile-less.mjs (used by macro-controller).
 * Run as part of `npm run build:payment-banner-hider`.
 *
 * Hard-fails (CODE RED format) if the source CSS is missing — this would
 * mean a developer deleted it, which would silently strip the visual
 * fade. Per .lovable/memory/standards/error-logging-requirements.md.
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const SRC = resolve(ROOT, "standalone-scripts/payment-banner-hider/css/payment-banner-hider.css");
const DEST = resolve(ROOT, "standalone-scripts/payment-banner-hider/dist/payment-banner-hider.css");

if (!existsSync(SRC)) {
    console.error("");
    console.error("========================================");
    console.error("  [CODE RED] payment-banner-hider CSS MISSING");
    console.error("========================================");
    console.error("  Path:     " + SRC);
    console.error("  Missing:  payment-banner-hider.css source file");
    console.error("  Reason:   instruction.assets.css declares this file; without it the");
    console.error("            built script ships without its fade animation. Restore from git.");
    console.error("========================================");
    process.exit(1);
}

mkdirSync(dirname(DEST), { recursive: true });
copyFileSync(SRC, DEST);

const bytes = statSync(DEST).size;
console.log(`[copy-payment-banner-hider-css] ✓ ${SRC} → ${DEST} (${bytes} bytes)`);
