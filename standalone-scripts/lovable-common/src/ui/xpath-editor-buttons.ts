/**
 * Shared XPath Editor — Reset/Save button wiring.
 *
 * Extracted from `xpath-editor-shell.ts` to keep that file under the
 * 100-line cap. Holds the `MountedEditor` mutable state struct plus
 * the `replaceTable` and `wireButtons` helpers — both depend on each
 * other so colocating them keeps the shell focused on layout.
 */

import { ID_RESET_BUTTON, ID_SAVE_BUTTON } from "./xpath-editor-constants";
import { buildEditorTable } from "./xpath-editor-table";
import { readEditorRows } from "./xpath-editor-reader";
import type { XPathEditorOptions, XPathEditorRow } from "./xpath-editor-types";

export interface MountedEditor {
    Root: HTMLDivElement;
    Table: HTMLTableElement;
    CurrentRows: XPathEditorRow[];
}

const replaceTable = (
    mounted: MountedEditor, doc: Document, rows: ReadonlyArray<XPathEditorRow>,
): void => {
    const fresh = buildEditorTable(doc, rows);
    mounted.Table.replaceWith(fresh);
    mounted.Table = fresh;
    mounted.CurrentRows = [...rows];
};

const wireReset = (mounted: MountedEditor, doc: Document, options: XPathEditorOptions): void => {
    const reset = mounted.Root.querySelector(`#${ID_RESET_BUTTON}`);

    if (!(reset instanceof HTMLButtonElement)) {
        return;
    }

    reset.addEventListener("click", () => {
        replaceTable(mounted, doc, options.DefaultRows);
        options.OnReset?.();
    });
};

const wireSave = (mounted: MountedEditor, options: XPathEditorOptions): void => {
    const save = mounted.Root.querySelector(`#${ID_SAVE_BUTTON}`);

    if (!(save instanceof HTMLButtonElement)) {
        return;
    }

    save.addEventListener("click", () => {
        const next = readEditorRows(mounted.Table, mounted.CurrentRows);
        mounted.CurrentRows = [...next];
        options.OnSave(next);
    });
};

export const wireEditorButtons = (
    mounted: MountedEditor, doc: Document, options: XPathEditorOptions,
): void => {
    wireReset(mounted, doc, options);
    wireSave(mounted, options);
};
