/**
 * Marco Extension — useStepGroupExport
 *
 * Reusable export pipeline shared by every panel that wants to ship a
 * "download selected groups as a ZIP" button.
 *
 * The hook owns:
 *
 *   1. Preview state — `previewStepGroupExport()` is run synchronously
 *      so we can surface counts + RunGroup-ref warnings before the user
 *      commits to the download.
 *   2. Confirm + download — packages the selected `StepGroupId`s via
 *      `runStepGroupExport()`, materialises the ZIP into a Blob, and
 *      pushes a synthetic <a download> click.
 *   3. Structured-error state — failures from either preview or the
 *      actual export are mapped via `explainExportFailure()` so the
 *      caller can render the shared `ExportErrorDialog`.
 *   4. Last-export summary — small object the caller can show in a
 *      "Last export" status line.
 *
 * The hook returns plain state + handlers (no JSX) so each panel keeps
 * full control over where the dialogs render. Both panels render the
 * same `ExportPreviewDialog` + `ExportErrorDialog` from this module's
 * exposed state, which guarantees identical UX.
 *
 * @see ./use-step-library — provides the SQL.js handle + project ctx.
 * @see @/background/recorder/step-library/export-bundle — packager.
 */

import { useCallback, useState } from "react";
import JSZip from "jszip";
import { toast } from "sonner";

import {
    previewStepGroupExport,
    runStepGroupExport,
    type StepGroupExportPreview,
} from "@/background/recorder/step-library/export-bundle";
import {
    explainExportFailure,
    type ExportErrorExplanation,
} from "@/background/recorder/step-library/export-error-explainer";
import type { LastExportSummary } from "@/components/options/BundleExchangePanel";
import type { useStepLibrary } from "@/hooks/use-step-library";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * The pieces of `useStepLibrary()` we actually need. We accept just
 * this slim slice (instead of the full hook return) so unit tests can
 * pass a minimal stub without recreating the entire library state.
 */
export interface StepLibrarySliceForExport {
    readonly Lib: ReturnType<typeof useStepLibrary>["Lib"];
    readonly Project: ReturnType<typeof useStepLibrary>["Project"];
    readonly SqlJs: ReturnType<typeof useStepLibrary>["SqlJs"];
}

interface ExportPreviewState {
    readonly Open: boolean;
    readonly Preview: StepGroupExportPreview | null;
    readonly Pending: { readonly Ids: ReadonlyArray<number>; readonly IncludeDescendants: boolean } | null;
}

interface ExportErrorState {
    readonly Open: boolean;
    readonly Explanation: ExportErrorExplanation | null;
}

export interface UseStepGroupExportApi {
    /**
     * Validate the selection, run a dry-run preview, and open the
     * preview dialog. Surfaces any failure via the structured error
     * dialog instead of a toast-only path.
     */
    readonly requestExport: (
        ids: ReadonlyArray<number>,
        includeDescendants?: boolean,
    ) => void;

    /**
     * Commit the previewed export — packages the bundle and triggers
     * the browser download. Called by `ExportPreviewDialog`'s confirm.
     */
    readonly confirmExport: () => Promise<void>;

    /** Last successfully-exported bundle (or `null` before any). */
    readonly lastExport: LastExportSummary | null;

    /* --- Dialog-binding state (caller renders the actual dialogs) --- */

    readonly previewState: ExportPreviewState;
    readonly setPreviewOpen: (open: boolean) => void;
    readonly errorState: ExportErrorState;
    readonly setErrorOpen: (open: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

const INITIAL_PREVIEW: ExportPreviewState = { Open: false, Preview: null, Pending: null };
const INITIAL_ERROR: ExportErrorState = { Open: false, Explanation: null };

export function useStepGroupExport(lib: StepLibrarySliceForExport): UseStepGroupExportApi {
    const [previewState, setPreviewState] = useState<ExportPreviewState>(INITIAL_PREVIEW);
    const [errorState, setErrorState] = useState<ExportErrorState>(INITIAL_ERROR);
    const [lastExport, setLastExport] = useState<LastExportSummary | null>(null);

    const showError = useCallback((explanation: ExportErrorExplanation) => {
        setErrorState({ Open: true, Explanation: explanation });
        toast.error(explanation.Title, { description: "See dialog for details" });
    }, []);

    const requestExport = useCallback(
        (ids: ReadonlyArray<number>, includeDescendants: boolean = true) => {
            if (lib.Lib === null || lib.Project === null || lib.SqlJs === null) {
                toast.error("Library not ready");
                return;
            }
            if (ids.length === 0) {
                toast.error("Select at least one group to export");
                return;
            }
            const preview = previewStepGroupExport({
                Source: lib.Lib,
                ProjectId: lib.Project.ProjectId,
                SelectedStepGroupIds: ids,
                IncludeDescendants: includeDescendants,
            });
            if (preview.Reason !== "Ok") {
                showError(explainExportFailure(preview));
                return;
            }
            setPreviewState({
                Open: true,
                Preview: preview,
                Pending: { Ids: ids, IncludeDescendants: includeDescendants },
            });
        },
        [lib.Lib, lib.Project, lib.SqlJs, showError],
    );

    const confirmExport = useCallback(async () => {
        const pending = previewState.Pending;
        setPreviewState(INITIAL_PREVIEW);
        if (pending === null) return;
        if (lib.Lib === null || lib.Project === null || lib.SqlJs === null) {
            toast.error("Library not ready");
            return;
        }
        const result = await runStepGroupExport({
            Source: lib.Lib,
            ProjectId: lib.Project.ProjectId,
            SelectedStepGroupIds: pending.Ids,
            IncludeDescendants: pending.IncludeDescendants,
            BundleName: `${lib.Project.Name} — ${pending.Ids.length} group(s)`,
            SqlJs: lib.SqlJs,
            JsZip: JSZip,
        });
        if (result.Reason !== "Ok") {
            showError(explainExportFailure(result));
            return;
        }
        // Materialise + push the download via a synthetic <a> click.
        const blob = new Blob([result.ZipBytes as BlobPart], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.ZipFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setLastExport({
            FileName: result.ZipFileName,
            GroupCount: result.Manifest.Counts.StepGroups,
            StepCount: result.Manifest.Counts.Steps,
            At: new Date().toISOString(),
        });
        toast.success(
            `Exported ${result.Manifest.Counts.StepGroups} group(s)`,
            { description: `${result.Manifest.Counts.Steps} steps · ${result.ZipFileName}` },
        );
    }, [previewState.Pending, lib.Lib, lib.Project, lib.SqlJs, showError]);

    const setPreviewOpen = useCallback((open: boolean) => {
        setPreviewState((p) => (open ? { ...p, Open: true } : INITIAL_PREVIEW));
    }, []);

    const setErrorOpen = useCallback((open: boolean) => {
        setErrorState((p) => (open ? { ...p, Open: true } : INITIAL_ERROR));
    }, []);

    return {
        requestExport,
        confirmExport,
        lastExport,
        previewState,
        setPreviewOpen,
        errorState,
        setErrorOpen,
    };
}
