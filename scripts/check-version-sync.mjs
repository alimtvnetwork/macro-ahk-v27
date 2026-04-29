#!/usr/bin/env node
/**
 * Version Sync Check
 *
 * Ensures every file that carries a version string declares the same
 * MAJOR.MINOR.PATCH value.  Covers shared constants, macro-controller
 * source & dist, and standalone script instructions.
 * Exit 1 on mismatch so CI / pre-commit can catch drift.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const files = [
  {
    label: "constants.ts",
    path: "src/shared/constants.ts",
    extract: (txt) => {
      const m = txt.match(/EXTENSION_VERSION\s*=\s*"(\d+\.\d+\.\d+)/);
      return m ? m[1] : null;
    },
  },
  {
    label: "shared-state.ts (macro-controller)",
    path: "standalone-scripts/macro-controller/src/shared-state.ts",
    extract: (txt) => {
      const m = txt.match(/VERSION\s*=\s*['"](\d+\.\d+\.\d+)/);
      return m ? m[1] : null;
    },
  },
  {
    label: "instruction.ts (macro-controller)",
    path: "standalone-scripts/macro-controller/src/instruction.ts",
    extract: (txt) => {
      const m = txt.match(/[Vv]ersion:\s*"(\d+\.\d+\.\d+)/);
      return m ? m[1] : null;
    },
  },
  {
    label: "dist/instruction.json (macro-controller)",
    path: "standalone-scripts/macro-controller/dist/instruction.json",
    optional: true,
    extract: (txt) => {
      const m = txt.match(/"[Vv]ersion"\s*:\s*"(\d+\.\d+\.\d+)/);
      return m ? m[1] : null;
    },
  },
  {
    label: "instruction.ts (lovable-common)",
    path: "standalone-scripts/lovable-common/src/instruction.ts",
    extract: (txt) => {
      const m = txt.match(/[Vv]ersion:\s*"(\d+\.\d+\.\d+)/);
      return m ? m[1] : null;
    },
  },
  {
    label: "instruction.ts (lovable-owner-switch)",
    path: "standalone-scripts/lovable-owner-switch/src/instruction.ts",
    extract: (txt) => {
      const m = txt.match(/[Vv]ersion:\s*"(\d+\.\d+\.\d+)/);
      return m ? m[1] : null;
    },
  },
  {
    label: "instruction.ts (lovable-user-add)",
    path: "standalone-scripts/lovable-user-add/src/instruction.ts",
    extract: (txt) => {
      const m = txt.match(/[Vv]ersion:\s*"(\d+\.\d+\.\d+)/);
      return m ? m[1] : null;
    },
  },
];

const results = files.map(({ label, path, extract, optional }) => {
  const fullPath = resolve(ROOT, path);
  try {
    const txt = readFileSync(fullPath, "utf-8");
    return { label, version: extract(txt), skipped: false };
  } catch {
    if (optional) {
      console.warn(`⚠ Skipped ${label} (file not found — will be validated by check-standalone-dist)`);
      return { label, version: null, skipped: true };
    }
    throw new Error(`Cannot read required file: ${path}`);
  }
});

const active = results.filter((r) => !r.skipped);
const missing = active.filter((r) => !r.version);
if (missing.length) {
  console.error("❌ Could not parse version from:", missing.map((r) => r.label).join(", "));
  process.exit(1);
}

const unique = [...new Set(active.map((r) => r.version))];

if (unique.length === 1) {
  console.log(`✅ All versions in sync: ${unique[0]}`);
  process.exit(0);
} else {
  console.error("❌ Version mismatch detected:");
  for (const r of results) {
    console.error(`   ${r.label}: ${r.version}`);
  }
  process.exit(1);
}
