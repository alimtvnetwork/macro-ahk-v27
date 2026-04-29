// Build guard: fails if xpath dist artifacts are stale
// (i.e., any source file is newer than the compiled bundle).
// Prevents deploying an extension with an outdated XPath utility.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const xpathDir = path.join(ROOT, "standalone-scripts", "xpath");
const distBundle = path.join(xpathDir, "dist", "xpath.js");
const srcDir = path.join(xpathDir, "src");

if (!fs.existsSync(distBundle)) {
  console.error("[FAIL] xpath/dist/xpath.js not found. Run: npm run build:xpath");
  process.exit(1);
}

if (!fs.existsSync(srcDir)) {
  console.error("[FAIL] xpath/src/ not found.");
  process.exit(1);
}

const distMtime = fs.statSync(distBundle).mtimeMs;

function collectSourceFiles(dir) {
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      entries.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|js|json)$/.test(entry.name)) {
      entries.push(full);
    }
  }
  return entries;
}

const sourceFiles = collectSourceFiles(srcDir);
const staleFiles = [];

for (const srcFile of sourceFiles) {
  const srcMtime = fs.statSync(srcFile).mtimeMs;
  if (srcMtime > distMtime) {
    const rel = path.relative(xpathDir, srcFile);
    const ageSec = Math.round((srcMtime - distMtime) / 1000);
    staleFiles.push({ file: rel, aheadBy: ageSec });
  }
}

if (staleFiles.length > 0) {
  console.error(`[FAIL] xpath dist is STALE — ${staleFiles.length} source file(s) are newer than dist/xpath.js:`);
  for (const { file, aheadBy } of staleFiles) {
    console.error(`       ${file} (${aheadBy}s newer)`);
  }
  console.error(`       Run: npm run build:xpath`);
  process.exit(1);
}

const distSize = fs.statSync(distBundle).size;
console.log(`[OK] xpath dist is fresh (${distSize} bytes, ${sourceFiles.length} source files checked)`);
