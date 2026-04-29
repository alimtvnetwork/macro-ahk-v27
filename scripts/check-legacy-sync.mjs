// Build guard: fails if the legacy 01-macro-looping.js is out of sync
// with the compiled dist/macro-looping.js bundle.
// Prevents stale-bundle regressions (e.g. "UIManager not registered").

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectDir = path.join(ROOT, "standalone-scripts", "macro-controller");
const distBundle = path.join(projectDir, "dist", "macro-looping.js");
const legacyBundle = path.join(projectDir, "01-macro-looping.js");

let failed = false;

if (!fs.existsSync(distBundle)) {
  console.error("[FAIL] dist/macro-looping.js not found. Build macro-controller first.");
  process.exit(1);
}

if (!fs.existsSync(legacyBundle)) {
  console.error("[FAIL] 01-macro-looping.js not found. Run sync-macro-controller-legacy.");
  process.exit(1);
}

const distContent = fs.readFileSync(distBundle);
const legacyContent = fs.readFileSync(legacyBundle);

if (!distContent.equals(legacyContent)) {
  const distSize = distContent.length;
  const legacySize = legacyContent.length;
  console.error(`[FAIL] 01-macro-looping.js is OUT OF SYNC with dist/macro-looping.js`);
  console.error(`       dist: ${distSize} bytes, legacy: ${legacySize} bytes`);
  console.error(`       Run: node scripts/sync-macro-controller-legacy.mjs`);
  process.exit(1);
}

console.log("[OK] 01-macro-looping.js is in sync with dist/macro-looping.js");
