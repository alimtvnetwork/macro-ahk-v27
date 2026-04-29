#!/usr/bin/env node
/**
 * CI guard: ensures no npm script in package.json uses `bun` as a command.
 * Windows builds don't have bun installed — use `node` instead.
 *
 * Usage: node scripts/no-bun-in-scripts.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const scripts = pkg.scripts ?? {};

let failed = false;
for (const [name, cmd] of Object.entries(scripts)) {
  // Match `bun ` at start or after && / || / ; / | delimiters
  if (/(?:^|&&|\|\||[;|])\s*bun\s/i.test(cmd)) {
    console.error(`✗ scripts["${name}"] uses bun: ${cmd}`);
    failed = true;
  }
}

if (failed) {
  console.error("\nFATAL: Replace 'bun' with 'node' in the scripts above for Windows compatibility.");
  process.exit(1);
} else {
  console.log("✓ No bun references found in package.json scripts.");
}
