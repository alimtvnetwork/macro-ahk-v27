/**
 * Shared Logs Viewer — copy button + filter wiring.
 *
 * Extracted from `log-viewer-shell.ts` to keep that file under the
 * 100-line cap. Owns the mutable `MountedViewer` struct plus the
 * filter-change and copy-click handlers.
 */

import {
    ID_LOG_COPY_BUTTON, ID_LOG_COPY_STATUS, ID_LOG_FILTER_PHASE,
    LABEL_COPIED, LABEL_COPY, LABEL_COPY_FAILED,
} from "./log-viewer-constants";
import { buildLogTable } from "./log-viewer-table";
import { copyEntriesToClipboard } from "./log-viewer-copy";
import { FILTER_ALL_VALUE, filterEntries } from "./log-viewer-filter";
import type { LogViewerEntry, LogViewerOptions } from "./log-viewer-types";

export interface MountedViewer {
    Root: HTMLDivElement;
    Table: HTMLTableElement;
    AllEntries: ReadonlyArray<LogViewerEntry>;
    CurrentPhase: string;
}

const replaceTable = (
    mounted: MountedViewer, doc: Document, visible: ReadonlyArray<LogViewerEntry>,
): void => {
    const fresh = buildLogTable(doc, visible);
    mounted.Table.replaceWith(fresh);
    mounted.Table = fresh;
};

const wireFilter = (mounted: MountedViewer, doc: Document): void => {
    const select = mounted.Root.querySelector(`#${ID_LOG_FILTER_PHASE}`);

    if (!(select instanceof HTMLSelectElement)) {
        return;
    }

    select.addEventListener("change", () => {
        mounted.CurrentPhase = select.value === "" ? FILTER_ALL_VALUE : select.value;
        replaceTable(mounted, doc, filterEntries(mounted.AllEntries, mounted.CurrentPhase));
    });
};

const wireCopy = (mounted: MountedViewer, options: LogViewerOptions): void => {
    const btn = mounted.Root.querySelector(`#${ID_LOG_COPY_BUTTON}`);

    if (!(btn instanceof HTMLButtonElement)) {
        return;
    }

    btn.addEventListener("click", () => {
        void (async (): Promise<void> => {
            const visible = filterEntries(mounted.AllEntries, mounted.CurrentPhase);
            const ok = await copyEntriesToClipboard(visible, options.OnCopy);
            btn.textContent = ok ? LABEL_COPIED : LABEL_COPY_FAILED;
            window.setTimeout(() => { btn.textContent = LABEL_COPY; }, 1500);
        })();
    });
};

export const wireViewerButtons = (
    mounted: MountedViewer, doc: Document, options: LogViewerOptions,
): void => {
    wireFilter(mounted, doc);
    wireCopy(mounted, options);
};

export const ensureCopyStatus = (doc: Document): HTMLSpanElement => {
    const span = doc.createElement("span");
    span.id = ID_LOG_COPY_STATUS;
    span.textContent = "";

    return span;
};
