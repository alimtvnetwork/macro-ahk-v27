/**
 * Shared Logs Viewer — top-level mount.
 *
 * Storage-agnostic shell: assembles header + filter + copy button +
 * table, injects the `lcl-` stylesheet once, delegates handler
 * wiring to `log-viewer-buttons.ts`. Both Owner Switch and User Add
 * mount this against their own normalized `LogViewerEntry[]` (see
 * thin adapters in each project).
 */

import {
    CSS_VIEWER_BTN, CSS_VIEWER_BTN_PRIMARY, CSS_VIEWER_EMPTY,
    CSS_VIEWER_HEADER, CSS_VIEWER_ROOT,
    ID_LOG_COPY_BUTTON, ID_LOG_VIEWER_ROOT,
    LABEL_COPY, LABEL_EMPTY, TITLE_VIEWER,
} from "./log-viewer-constants";
import { logViewerCss } from "./log-viewer-css";
import { buildLogTable } from "./log-viewer-table";
import { buildFilterSelect, FILTER_ALL_VALUE } from "./log-viewer-filter";
import { wireViewerButtons } from "./log-viewer-buttons";
import type { MountedViewer } from "./log-viewer-buttons";
import type { LogViewerOptions } from "./log-viewer-types";

const ensureStylesheet = (doc: Document): void => {
    if (doc.getElementById(`${ID_LOG_VIEWER_ROOT}-css`) !== null) {
        return;
    }

    const style = doc.createElement("style");
    style.id = `${ID_LOG_VIEWER_ROOT}-css`;
    style.textContent = logViewerCss;
    doc.head.appendChild(style);
};

const buildHeader = (doc: Document, options: LogViewerOptions): HTMLDivElement => {
    const header = doc.createElement("div");
    header.className = CSS_VIEWER_HEADER;
    const title = doc.createElement("h3");
    title.textContent = TITLE_VIEWER;
    const actions = doc.createElement("div");
    actions.appendChild(buildFilterSelect(doc, options.Entries));
    const btn = doc.createElement("button");
    btn.type = "button";
    btn.id = ID_LOG_COPY_BUTTON;
    btn.className = `${CSS_VIEWER_BTN} ${CSS_VIEWER_BTN_PRIMARY}`;
    btn.textContent = LABEL_COPY;
    actions.appendChild(btn);
    header.appendChild(title);
    header.appendChild(actions);

    return header;
};

const buildEmptyNotice = (doc: Document): HTMLDivElement => {
    const div = doc.createElement("div");
    div.className = CSS_VIEWER_EMPTY;
    div.textContent = LABEL_EMPTY;

    return div;
};

export const mountLogViewer = (host: HTMLElement, options: LogViewerOptions): void => {
    const doc = host.ownerDocument;
    ensureStylesheet(doc);
    const root = doc.createElement("div");
    root.id = ID_LOG_VIEWER_ROOT;
    root.className = CSS_VIEWER_ROOT;
    root.appendChild(buildHeader(doc, options));

    if (options.Entries.length === 0) {
        root.appendChild(buildEmptyNotice(doc));
        host.appendChild(root);
        return;
    }

    const table = buildLogTable(doc, options.Entries);
    root.appendChild(table);
    host.appendChild(root);
    const mounted: MountedViewer = {
        Root: root, Table: table, AllEntries: options.Entries, CurrentPhase: FILTER_ALL_VALUE,
    };
    wireViewerButtons(mounted, doc, options);
};
