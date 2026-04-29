/**
 * Build guard: Axios version safety check
 *
 * Fails the build if a known-compromised version of axios is installed.
 * See AXIOS-SECURITY-NOTE.md for details.
 *
 * Exit codes:
 *   0 — safe version detected
 *   3 — compromised version detected (halts build)
 *   1 — axios not found or read error
 */

import { readFileSync } from "fs";
import { createRequire } from "module";

const COMPROMISED_VERSIONS = ["1.14.1", "0.30.4"];

try {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve("axios/package.json");
  const { version } = JSON.parse(readFileSync(pkgPath, "utf-8"));

  if (COMPROMISED_VERSIONS.includes(version)) {
    console.error(`\n  [FATAL] axios@${version} is a COMPROMISED version!`);
    console.error(`  Known bad versions: ${COMPROMISED_VERSIONS.join(", ")}`);
    console.error(`  See AXIOS-SECURITY-NOTE.md for details.\n`);
    process.exit(3);
  }

  console.log(`  [OK] axios@${version} (safe)`);
} catch (err) {
  console.error(`  [ERROR] Could not verify axios version: ${err.message}`);
  process.exit(1);
}
