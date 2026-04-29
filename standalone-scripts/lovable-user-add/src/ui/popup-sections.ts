/**
 * User Add popup — section builders.
 *
 * Three sections: CSV upload, Task settings (incl. default-role
 * select — P14 deliverable), Rows preview. Each builder ≤ 15 lines.
 */

import {
    CSS_SECTION, CSS_BUTTON_PRIMARY, DEFAULT_LOGIN_URL,
    ID_COMMON_PASSWORD, ID_DEFAULT_ROLE, ID_ERRORS_PANEL, ID_FILE_INPUT,
    ID_INCOGNITO_TOGGLE, ID_LOGIN_URL, ID_ROWS_TABLE, ID_RUN_BUTTON, ID_TASK_NAME,
} from "./popup-constants";
import { buildField, buildSelectField, buildTable } from "./popup-elements";
import { DEFAULT_ROLE_OPTIONS, DEFAULT_ROLE_VALUE } from "./popup-role-options";
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

const buildTaskFields = (s: HTMLElement): void => {
    s.appendChild(buildField({ Id: ID_TASK_NAME, Label: "Task name", Type: "text", Placeholder: "User add 2026-04-24" }));
    s.appendChild(buildField({ Id: ID_COMMON_PASSWORD, Label: "Common password", Type: "password" }));
    s.appendChild(buildField({ Id: ID_LOGIN_URL, Label: "Login URL", Type: "url", Placeholder: DEFAULT_LOGIN_URL }));
    s.appendChild(buildSelectField({
        Id: ID_DEFAULT_ROLE, Label: "Default role (when CSV Role cell is empty)",
        Options: DEFAULT_ROLE_OPTIONS, DefaultValue: DEFAULT_ROLE_VALUE,
    }));
    s.appendChild(buildField({ Id: ID_INCOGNITO_TOGGLE, Label: "Run in incognito", Type: "checkbox" }));
};

export const buildTaskSection = (): HTMLElement => {
    const s = sectionShell("Task Settings");
    buildTaskFields(s);

    return s;
};

export const buildRowsSection = (): HTMLElement => {
    const s = sectionShell("Rows");
    s.appendChild(buildTable(ID_ROWS_TABLE, ROW_HEADERS));
    const button = document.createElement("button");
    button.id = ID_RUN_BUTTON;
    button.className = CSS_BUTTON_PRIMARY;
    button.disabled = true;
    button.textContent = "Run (wired in P17)";
    s.appendChild(button);

    return s;
};
