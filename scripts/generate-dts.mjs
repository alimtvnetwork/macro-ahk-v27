#!/usr/bin/env node
/**
 * Generate riseup-macro-sdk.d.ts
 *
 * Writes the TypeScript declarations file to
 * standalone-scripts/marco-sdk/dist/riseup-macro-sdk.d.ts
 *
 * Usage: node scripts/generate-dts.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// Import the generator — try .ts (bun/tsx) first, fall back to inline
let generateDts;
try {
  const mod = await import("../src/lib/generate-dts.ts");
  generateDts = mod.generateDts;
} catch {
  // Node can't load .ts — dynamically read and eval the exported function
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(resolve(root, "src/lib/generate-dts.ts"), "utf-8");
  // Extract the function body (it just returns a template literal string)
  const match = src.match(/export function generateDts\(\):\s*string\s*\{([\s\S]*)\}\s*$/);
  if (!match) throw new Error("Could not parse generateDts from src/lib/generate-dts.ts");
  generateDts = new Function(match[1]);
}

const outPath = resolve(root, "standalone-scripts/marco-sdk/dist/riseup-macro-sdk.d.ts");
mkdirSync(dirname(outPath), { recursive: true });

const dts = generateDts();
writeFileSync(outPath, dts, "utf-8");
console.log(`✓ Written riseup-macro-sdk.d.ts (${dts.length} chars)`);
