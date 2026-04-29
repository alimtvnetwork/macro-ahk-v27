import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectDir = path.join(ROOT, "standalone-scripts", "macro-controller");
const distBundle = path.join(projectDir, "dist", "macro-looping.js");
const legacyBundle = path.join(projectDir, "01-macro-looping.js");

if (!fs.existsSync(distBundle)) {
  console.error("[FAIL] dist/macro-looping.js not found; cannot sync legacy macro bundle.");
  process.exit(1);
}

fs.copyFileSync(distBundle, legacyBundle);
const size = fs.statSync(legacyBundle).size;
console.log(`[OK] Synced legacy macro bundle -> standalone-scripts/macro-controller/01-macro-looping.js (${size} bytes)`);
