/**
 * Owner Switch popup — section builders.
 *
 * Each builder returns one `<section>` block. Kept separate so the
 * top-level `mountPopup` stays under the 15-line cap.
 */

import {
    CSS_SECTION,
    ID_COMMON_PASSWORD,
    ID_ERRORS_PANEL,
    ID_FILE_INPUT,
    ID_INCOGNITO_TOGGLE,
    ID_LOGIN_URL,
    ID_ROWS_TABLE,
    ID_RUN_BUTTON,
    ID_TASK_NAME,
    DEFAULT_LOGIN_URL,
    CSS_BUTTON_PRIMARY,
} from "./popup-constants";
import { buildField, buildTable } from "./popup-elements";
import { ROW_HEADERS } from "./popup-rows";

const sectionShell = (title: string): HTMLElement => {
    const section = document.createElement("section");
    section.className = CSS_SECTION;
    const h3 = document.createElement("h3");
    h3.textContent = title;
    section.appendChild(h3);

    return section;
};

export const buildFileSection = (): HTMLElement => {
    const s = sectionShell("CSV Upload");
    s.appendChild(buildField({ Id: ID_FILE_INPUT, Label: "Choose CSV file", Type: "file" }));
    const errors = document.createElement("div");
    errors.id = ID_ERRORS_PANEL;
    s.appendChild(errors);

    return s;
};

export const buildTaskSection = (): HTMLElement => {
    const s = sectionShell("Task Settings");
    s.appendChild(buildField({ Id: ID_TASK_NAME, Label: "Task name", Type: "text", Placeholder: "Owner switch 2026-04-24" }));
    s.appendChild(buildField({ Id: ID_COMMON_PASSWORD, Label: "Common password (fallback)", Type: "password" }));
    s.appendChild(buildField({ Id: ID_LOGIN_URL, Label: "Login URL", Type: "url", Placeholder: DEFAULT_LOGIN_URL }));
    s.appendChild(buildField({ Id: ID_INCOGNITO_TOGGLE, Label: "Run in incognito", Type: "checkbox" }));

    return s;
};

export const buildRowsSection = (): HTMLElement => {
    const s = sectionShell("Rows");
    s.appendChild(buildTable(ID_ROWS_TABLE, ROW_HEADERS));
    const button = document.createElement("button");
    button.id = ID_RUN_BUTTON;
    button.className = CSS_BUTTON_PRIMARY;
    button.disabled = true;
    button.textContent = "Run (wired in P10)";
    s.appendChild(button);

    return s;
};
