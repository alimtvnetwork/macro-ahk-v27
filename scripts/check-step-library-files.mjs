#!/usr/bin/env node
/**
 * check-step-library-files.mjs
 *
 * Prebuild guard for the recorder step-library. Fails before Vite/Rollup when
 * any expected module file is missing or empty, with exact paths and a clear
 * remediation message.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
    EXPECTED_STEP_LIBRARY_FILES,
    STEP_LIBRARY_DIR,
    verifyStepLibraryFilesOrFail,
} from "./lib/step-library-file-guard.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
    console.error(`\n❌ [check-step-library-files] ${message}\n`);
    process.exit(1);
}

verifyStepLibraryFilesOrFail(ROOT, fail);

console.log(
    `✅ [check-step-library-files] OK — ${EXPECTED_STEP_LIBRARY_FILES.length} expected files present in ${STEP_LIBRARY_DIR}/`,
);