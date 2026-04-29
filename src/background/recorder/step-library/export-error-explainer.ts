/**
 * Marco Extension — Export Error Explainer
 *
 * Pure mapping from an `ExportFailure.Reason` produced by
 * `runStepGroupExport` (or `previewStepGroupExport`) to a user-facing
 * explanation:
 *
 *   - `Title`       — short headline (≤ 60 chars)
 *   - `Summary`     — 1-2 sentence plain-English description of what went
 *                     wrong and the most likely cause.
 *   - `Suggestion`  — concrete next step the user can take.
 *   - `Severity`    — UI hint:
 *                       "Selection" — the user's chosen IDs are bad/empty
 *                       "Bundle"    — the bundle would be unusable on import
 *                                     (e.g. dangling RunGroup refs)
 *                       "Internal"  — something the user can't fix
 *
 * Mirrors the shape of `import-error-explainer.ts` so the two dialogs
 * share a render contract and can be tested without sql.js.
 *
 * @see ./export-bundle.ts — `ExportReason` discriminator
 */

import type { ExportFailure, ExportReason } from "./export-bundle";

export type ExportErrorSeverity = "Selection" | "Bundle" | "Internal";

export interface ExportErrorExplanation {
    readonly Title: string;
    readonly Summary: string;
    readonly Suggestion: string;
    readonly Severity: ExportErrorSeverity;
    /** The raw failure surfaced by the runner — passed through for the "Technical detail" disclosure. */
    readonly Failure: ExportFailure;
}

type Reason = Exclude<ExportReason, "Ok">;

interface ReasonTemplate {
    readonly Title: string;
    readonly Summary: string;
    readonly Suggestion: string;
    readonly Severity: ExportErrorSeverity;
}

const TEMPLATES: Record<Reason, ReasonTemplate> = {
    EmptySelection: {
        Title: "No groups selected",
        Summary:
            "An export needs at least one ticked StepGroup, but the selection was empty when the bundle was requested.",
        Suggestion:
            "Tick one or more groups in the tree on the left, then try Export again.",
        Severity: "Selection",
    },
    ProjectNotFound: {
        Title: "Source project no longer exists",
        Summary:
            "The project the selected groups belong to disappeared from the library mid-export — most often because it was deleted in another window or tab.",
        Suggestion:
            "Reload the page, switch to a project that still exists, then re-tick the groups you want to export.",
        Severity: "Selection",
    },
    GroupNotFound: {
        Title: "Selected groups no longer exist",
        Summary:
            "One or more StepGroups in the selection are not present in the source project anymore. They may have been deleted or moved between tick and export.",
        Suggestion:
            "Reload the library, re-tick the groups you want, then export again. The IDs that disappeared are listed under Technical detail.",
        Severity: "Selection",
    },
    GroupOutsideProject: {
        Title: "Selected group belongs to a different project",
        Summary:
            "At least one ticked StepGroup lives under a project other than the one being exported. A bundle can only carry groups from a single project.",
        Suggestion:
            "Untick the cross-project IDs (shown under Technical detail), or switch to the project that actually owns them and start the export from there.",
        Severity: "Selection",
    },
    RunGroupTargetMissing: {
        Title: "RunGroup steps point outside the selection",
        Summary:
            "The selection contains RunGroup invocations whose target StepGroup is not part of the bundle. Exporting as-is would produce broken references on import.",
        Suggestion:
            "Tick the missing target groups too, or enable “Include descendants” so referenced sub-trees travel with the export. The offending Step IDs are under Technical detail.",
        Severity: "Bundle",
    },
    InternalError: {
        Title: "Unexpected export error",
        Summary:
            "The exporter threw before the .zip could be assembled. No file was downloaded and your library is unchanged.",
        Suggestion:
            "Try the export again. If it keeps failing, file a bug and attach the technical detail below — especially the Reason and any IDs.",
        Severity: "Internal",
    },
};

/**
 * Map a structured `ExportFailure` to a user-facing explanation.
 * Always returns a defined value — unknown reasons fall back to
 * `InternalError` so the dialog can never render with empty copy.
 */
export function explainExportFailure(failure: ExportFailure): ExportErrorExplanation {
    const tpl: ReasonTemplate = TEMPLATES[failure.Reason] ?? TEMPLATES.InternalError;
    return {
        Title: tpl.Title,
        Summary: tpl.Summary,
        Suggestion: tpl.Suggestion,
        Severity: tpl.Severity,
        Failure: failure,
    };
}
