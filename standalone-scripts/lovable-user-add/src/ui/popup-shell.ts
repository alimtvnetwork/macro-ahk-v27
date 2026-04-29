/**
 * User Add popup — top-level mount.
 *
 * P14 deliverable: assembles the three sections, injects CSS, wires the
 * file input → render pipeline. No SQLite, no API — those land in
 * P15–P17. The `Default role` select drives the value applied to rows
 * whose CSV `Role` cell is null at task-creation time (P15).
 */

import {
    CSS_ROOT, DEFAULT_LOGIN_URL,
    ID_ERRORS_PANEL, ID_FILE_INPUT, ID_LOGIN_URL, ID_ROOT, ID_ROWS_TABLE,
} from "./popup-constants";
import { popupCss } from "./popup-css";
import { buildFileSection, buildTaskSection, buildRowsSection } from "./popup-sections";
import { renderRows } from "./popup-rows";
import { renderErrors } from "./popup-errors";
import { wireFileInput } from "./popup-file-input";

const ensureStylesheet = (doc: Document): void => {
    if (doc.getElementById(`${ID_ROOT}-css`) !== null) {
        return;
    }

    const style = doc.createElement("style");
    style.id = `${ID_ROOT}-css`;
    style.textContent = popupCss;
    doc.head.appendChild(style);
};

const seedDefaults = (doc: Document): void => {
    const url = doc.getElementById(ID_LOGIN_URL);

    if (url instanceof HTMLInputElement && url.value.length === 0) {
        url.value = DEFAULT_LOGIN_URL;
    }
};

const wireParseHandler = (doc: Document): void => {
    const input = doc.getElementById(ID_FILE_INPUT);
    const table = doc.getElementById(ID_ROWS_TABLE);
    const errors = doc.getElementById(ID_ERRORS_PANEL);

    if (!(input instanceof HTMLInputElement) || !(table instanceof HTMLTableElement) || errors === null) {
        return;
    }

    const tbody = table.tBodies[0];
    wireFileInput(input, (result, _name): void => {
        renderRows(tbody, result);
        renderErrors(errors, result.Errors, result.Warnings);
    });
};

export const mountPopup = (host: HTMLElement): void => {
    ensureStylesheet(host.ownerDocument);
    host.id = ID_ROOT;
    host.className = CSS_ROOT;
    host.appendChild(buildFileSection());
    host.appendChild(buildTaskSection());
    host.appendChild(buildRowsSection());
    seedDefaults(host.ownerDocument);
    wireParseHandler(host.ownerDocument);
};
