/**
 * Shared XPath Editor — top-level mount.
 *
 * Storage-agnostic shell: assembles header + table + Reset/Save
 * buttons, injects the `lcx-` stylesheet once, delegates handler
 * wiring to `xpath-editor-buttons.ts`. No SQLite import — Owner
 * Switch and User Add bind their own persistence layer.
 */

import {
    CSS_EDITOR_BTN, CSS_EDITOR_BTN_GHOST, CSS_EDITOR_BTN_PRIMARY,
    CSS_EDITOR_HEADER, CSS_EDITOR_ROOT,
    ID_RESET_BUTTON, ID_SAVE_BUTTON, ID_XPATH_EDITOR_ROOT,
    LABEL_RESET, LABEL_SAVE, TITLE_EDITOR,
} from "./xpath-editor-constants";
import { xpathEditorCss } from "./xpath-editor-css";
import { buildEditorTable } from "./xpath-editor-table";
import { wireEditorButtons } from "./xpath-editor-buttons";
import type { MountedEditor } from "./xpath-editor-buttons";
import type { XPathEditorOptions } from "./xpath-editor-types";

const ensureStylesheet = (doc: Document): void => {
    if (doc.getElementById(`${ID_XPATH_EDITOR_ROOT}-css`) !== null) {
        return;
    }

    const style = doc.createElement("style");
    style.id = `${ID_XPATH_EDITOR_ROOT}-css`;
    style.textContent = xpathEditorCss;
    doc.head.appendChild(style);
};

const buildButton = (doc: Document, id: string, variant: string, label: string): HTMLButtonElement => {
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.id = id;
    btn.className = `${CSS_EDITOR_BTN} ${variant}`;
    btn.textContent = label;

    return btn;
};

const buildHeader = (doc: Document): HTMLDivElement => {
    const header = doc.createElement("div");
    header.className = CSS_EDITOR_HEADER;
    const title = doc.createElement("h3");
    title.textContent = TITLE_EDITOR;
    const actions = doc.createElement("div");
    actions.appendChild(buildButton(doc, ID_RESET_BUTTON, CSS_EDITOR_BTN_GHOST, LABEL_RESET));
    actions.appendChild(buildButton(doc, ID_SAVE_BUTTON, CSS_EDITOR_BTN_PRIMARY, LABEL_SAVE));
    header.appendChild(title);
    header.appendChild(actions);

    return header;
};

export const mountXPathEditor = (host: HTMLElement, options: XPathEditorOptions): void => {
    const doc = host.ownerDocument;
    ensureStylesheet(doc);
    const root = doc.createElement("div");
    root.id = ID_XPATH_EDITOR_ROOT;
    root.className = CSS_EDITOR_ROOT;
    const table = buildEditorTable(doc, options.InitialRows);
    root.appendChild(buildHeader(doc));
    root.appendChild(table);
    host.appendChild(root);
    const mounted: MountedEditor = { Root: root, Table: table, CurrentRows: [...options.InitialRows] };
    wireEditorButtons(mounted, doc, options);
};
