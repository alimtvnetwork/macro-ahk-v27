/**
 * Marco Extension — Import Error Explainer
 *
 * Pure mapping from an `ImportFailure.Reason` produced by
 * `runStepGroupImport` to a user-facing explanation:
 *
 *   - `Title`       — short headline (≤ 60 chars)
 *   - `Summary`     — 1-2 sentence plain-English description of what went
 *                     wrong and the most likely cause.
 *   - `Suggestion`  — concrete next step the user can take.
 *   - `Severity`    — UI hint: "Bundle"   (the file is bad/incompatible)
 *                              | "Conflict" (the bundle is fine; destination state is the issue)
 *                              | "Internal" (something the user can't fix)
 *
 * Keeping this module pure and string-only means we can exercise every
 * branch in unit tests without spinning up sql.js, and the dialog
 * component stays thin.
 *
 * @see ./import-bundle.ts — `ImportReason` discriminator
 */

import type { ImportFailure, ImportReason } from "./import-bundle";

export type ImportErrorSeverity = "Bundle" | "Conflict" | "Internal";

export interface ImportErrorExplanation {
    readonly Title: string;
    readonly Summary: string;
    readonly Suggestion: string;
    readonly Severity: ImportErrorSeverity;
    /** The raw failure surfaced by the runner — passed through for the "Technical detail" disclosure. */
    readonly Failure: ImportFailure;
}

type Reason = Exclude<ImportReason, "Ok">;

interface ReasonTemplate {
    readonly Title: string;
    readonly Summary: string;
    readonly Suggestion: string;
    readonly Severity: ImportErrorSeverity;
}

const TEMPLATES: Record<Reason, ReasonTemplate> = {
    BundleNotZip: {
        Title: "This file isn't a valid ZIP",
        Summary:
            "The selected file couldn't be opened as a ZIP archive. It may be corrupted, truncated, or not actually a zipped bundle.",
        Suggestion:
            "Try downloading the bundle again, or confirm you exported it from this extension. Files renamed to .zip but not actually zipped will fail here.",
        Severity: "Bundle",
    },
    ManifestMissing: {
        Title: "Bundle is missing its manifest",
        Summary:
            "The ZIP opened, but it has no `manifest.json` at the root. Every Marco bundle must contain one — without it we can't know what's inside.",
        Suggestion:
            "Make sure you're importing a bundle exported by this extension. Generic ZIPs of step files are not supported.",
        Severity: "Bundle",
    },
    ManifestMalformed: {
        Title: "Bundle manifest is invalid",
        Summary:
            "The `manifest.json` was found but doesn't have the expected shape. It may be hand-edited, truncated, or produced by an unrelated tool.",
        Suggestion:
            "Re-export the bundle. If you opened the manifest in an editor and saved changes, undo them — the file's hashes must match exactly.",
        Severity: "Bundle",
    },
    ManifestVersionUnsupported: {
        Title: "Bundle is from a newer version",
        Summary:
            "This bundle was exported by a newer build of the extension that uses a manifest format this version doesn't understand.",
        Suggestion:
            "Update the extension to the latest version, then try the import again. Older versions cannot read newer bundle formats.",
        Severity: "Bundle",
    },
    DbFileMissing: {
        Title: "Bundle is missing its database",
        Summary:
            "The manifest references a `.sqlite` file that isn't present inside the ZIP. The bundle is incomplete.",
        Suggestion:
            "Re-export the bundle from the source — do not edit the ZIP after export. Removing or renaming any file inside breaks integrity checks.",
        Severity: "Bundle",
    },
    DbChecksumMismatch: {
        Title: "Bundle was modified or corrupted",
        Summary:
            "The embedded database doesn't match the SHA-256 checksum recorded in the manifest. The bundle was tampered with, truncated during transfer, or corrupted on disk.",
        Suggestion:
            "Download or copy the bundle again from the original source. Do not unzip and re-zip — that always changes the contents.",
        Severity: "Bundle",
    },
    DbSchemaIncompatible: {
        Title: "Bundle's database schema is incompatible",
        Summary:
            "The embedded SQLite database doesn't follow the schema this extension expects. It's likely from a different product or a much older version.",
        Suggestion:
            "Confirm this bundle was produced by this extension's Export feature. If it was, the source extension may be too old — re-export it after upgrading.",
        Severity: "Bundle",
    },
    DbCorrupt: {
        Title: "Bundle's database can't be opened",
        Summary:
            "SQLite refused to open the embedded database file. The bytes inside the ZIP are likely corrupted.",
        Suggestion:
            "Re-download the bundle. If the issue persists, the export itself may have failed — try re-exporting from the source.",
        Severity: "Bundle",
    },
    DestinationProjectMissing: {
        Title: "Destination project no longer exists",
        Summary:
            "The project you're importing into can't be found in the library. It may have been deleted in another window.",
        Suggestion:
            "Reload the page, pick a different project, then start the import again.",
        Severity: "Conflict",
    },
    AttachParentMissing: {
        Title: "Target parent group not found",
        Summary:
            "The group you asked the bundle to be attached under doesn't exist anymore. It may have been deleted or archived since you opened the dialog.",
        Suggestion:
            "Cancel and pick a different parent group, or import at the top level of the project.",
        Severity: "Conflict",
    },
    AttachParentWrongProject: {
        Title: "Target parent belongs to a different project",
        Summary:
            "The parent group you selected lives under a project other than the destination. Cross-project nesting is not allowed.",
        Suggestion:
            "Pick a parent that belongs to the destination project, or import to the top level instead.",
        Severity: "Conflict",
    },
    NameConflict: {
        Title: "Name conflicts with existing groups",
        Summary:
            "One or more imported group names collide with existing siblings, and your conflict policy is set to fail (or no rename was available).",
        Suggestion:
            "Switch the conflict policy to 'Rename' so duplicates get a suffix, or rename the existing groups first.",
        Severity: "Conflict",
    },
    RunGroupTargetMissing: {
        Title: "Bundle has broken Run-Group references",
        Summary:
            "The bundle contains Run-Group steps that reference groups not included inside it. The export is incomplete and would produce dangling links.",
        Suggestion:
            "Re-export the source bundle with 'Include descendants' (or equivalent) enabled so every referenced group travels with it.",
        Severity: "Bundle",
    },
    InternalError: {
        Title: "Unexpected import error",
        Summary:
            "Something inside the importer threw before the merge could complete. No changes were written to your library.",
        Suggestion:
            "Try the import again. If it keeps happening, file a bug and attach the bundle plus the technical detail below.",
        Severity: "Internal",
    },
};

/**
 * Map a structured `ImportFailure` to a user-facing explanation.
 * Always returns a defined value — unknown reasons fall back to
 * `InternalError` so the dialog can never render with empty copy.
 */
export function explainImportFailure(failure: ImportFailure): ImportErrorExplanation {
    const tpl: ReasonTemplate = TEMPLATES[failure.Reason] ?? TEMPLATES.InternalError;
    return {
        Title: tpl.Title,
        Summary: tpl.Summary,
        Suggestion: tpl.Suggestion,
        Severity: tpl.Severity,
        Failure: failure,
    };
}
