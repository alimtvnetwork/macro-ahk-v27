import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const STEP_LIBRARY_DIR = "src/background/recorder/step-library";

export const EXPECTED_STEP_LIBRARY_FILES = Object.freeze([
    "csv-mapping.ts",
    "csv-parse.ts",
    "db.ts",
    "export-bundle.ts",
    "export-error-explainer.ts",
    "group-inputs.ts",
    "hotkey-executor.ts",
    "import-bundle.ts",
    "import-error-explainer.ts",
    "index.ts",
    "input-source.ts",
    "replay-bridge.ts",
    "result-webhook.ts",
    "run-batch.ts",
    "run-group-runner.ts",
    "schema.ts",
    "step-wait.ts",
]);

export function probeStepLibraryFiles(root) {
    const dirAbs = join(root, STEP_LIBRARY_DIR);

    if (!existsSync(dirAbs)) {
        return { ok: false, kind: "no-dir", dirAbs, missing: [], empties: [], present: new Set() };
    }

    const dirStat = statSync(dirAbs);
    if (!dirStat.isDirectory()) {
        return { ok: false, kind: "not-dir", dirAbs, missing: [], empties: [], present: new Set() };
    }

    const present = new Set(readdirSync(dirAbs));
    const missing = EXPECTED_STEP_LIBRARY_FILES.filter((fileName) => !present.has(fileName));
    if (missing.length > 0) {
        return { ok: false, kind: "missing", dirAbs, missing, empties: [], present };
    }

    const empties = EXPECTED_STEP_LIBRARY_FILES.filter((fileName) => statSync(join(dirAbs, fileName)).size === 0);
    if (empties.length > 0) {
        return { ok: false, kind: "empty", dirAbs, missing: [], empties, present };
    }

    return { ok: true, kind: "ok", dirAbs, missing: [], empties: [], present };
}

export function formatStepLibraryFileGuardFailure(root, probe) {
    const expectedStatus = EXPECTED_STEP_LIBRARY_FILES
        .map((fileName) => `   ${probe.missing.includes(fileName) ? "✗" : "✓"} ${fileName}${probe.missing.includes(fileName) ? "  (MISSING)" : ""}`)
        .join("\n");
    const siblings = probe.present.size > 0 ? Array.from(probe.present).sort().join(", ") : "(directory empty)";

    if (probe.kind === "no-dir") {
        return [
            "Step-library directory missing.",
            `   Repo root     : ${root}`,
            `   Expected path : ${probe.dirAbs}`,
            `   Missing item  : ${STEP_LIBRARY_DIR}/`,
            "   Reason        : Bundling will fail at the first import from this directory.",
            `   Remediation   : Restore ${STEP_LIBRARY_DIR}/ from source control, or update scripts/lib/step-library-file-guard.mjs if the directory was intentionally moved.`,
        ].join("\n");
    }

    if (probe.kind === "not-dir") {
        return [
            "Step-library path exists but is not a directory.",
            `   Repo root     : ${root}`,
            `   Path          : ${probe.dirAbs}`,
            `   Missing item  : directory ${STEP_LIBRARY_DIR}/`,
            "   Reason        : Expected a directory containing step-library module files.",
            `   Remediation   : Replace this path with the ${STEP_LIBRARY_DIR}/ directory, or update scripts/lib/step-library-file-guard.mjs if the module root changed.`,
        ].join("\n");
    }

    if (probe.kind === "empty") {
        return [
            "Step-library file(s) are empty.",
            `   Repo root     : ${root}`,
            `   Directory    : ${probe.dirAbs}`,
            `   Empty items  : ${probe.empties.join(", ")}`,
            "   Reason       : Empty modules cannot expose the named exports importers rely on.",
            "   Remediation  : Restore the file body from source control, or recreate the module with its expected exports.",
        ].join("\n");
    }

    const perFileChecks = probe.missing
        .map((fileName) => {
            const abs = join(probe.dirAbs, fileName);
            const lines = [
                `   • ${STEP_LIBRARY_DIR}/${fileName}`,
                `       checked path        : ${abs}`,
                `       file:// URL         : ${pathToFileURL(abs).href}`,
                `       existsSync()        : ${existsSync(abs)}`,
            ];

            try {
                const fileStat = statSync(abs);
                lines.push(`       statSync.isFile     : ${fileStat.isFile()}`);
                lines.push(`       statSync.size       : ${fileStat.size} bytes`);
                lines.push(`       statSync.mtime      : ${fileStat.mtime.toISOString()}`);
            } catch (err) {
                lines.push(`       statSync()          : threw ${err?.code ?? "ERR"} — ${err?.message ?? "unknown"}`);
                lines.push("       size                : n/a (no stat)");
                lines.push("       mtime               : n/a (no stat)");
            }

            lines.push(`       siblings in dir     : ${siblings}`);
            return lines.join("\n");
        })
        .join("\n");

    return [
        "Required step-library file(s) missing.",
        `   Repo root      : ${root}`,
        `   Directory      : ${probe.dirAbs}`,
        `   Directory URL  : ${pathToFileURL(probe.dirAbs).href}`,
        `   Missing items  : ${probe.missing.map((fileName) => `${STEP_LIBRARY_DIR}/${fileName}`).join(", ")}`,
        "   Reason         : These modules are imported by the build graph; absent files trigger ENOENT inside Rollup/Vite.",
        "   Remediation    : Restore the missing file(s) from source control, or recreate each module with the expected exports. If removal was intentional, update EXPECTED_STEP_LIBRARY_FILES in scripts/lib/step-library-file-guard.mjs and the step-library barrel exports.",
        "",
        `   Expected file status (${EXPECTED_STEP_LIBRARY_FILES.length} entries):`,
        expectedStatus,
        "",
        "   Per-file checks performed:",
        perFileChecks,
    ].join("\n");
}

export function verifyStepLibraryFilesOrFail(root, fail) {
    const probe = probeStepLibraryFiles(root);
    if (!probe.ok) {
        fail(formatStepLibraryFileGuardFailure(root, probe));
    }

    return probe;
}