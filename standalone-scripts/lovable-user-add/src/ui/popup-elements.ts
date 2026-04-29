/**
 * User Add popup — DOM element factories.
 *
 * Tiny helpers for labeled input, labeled select, and table builders.
 * Each function ≤ 15 lines so the shell stays under cap.
 */

import { CSS_FIELD, CSS_INPUT, CSS_LABEL, CSS_SELECT, CSS_TABLE } from "./popup-constants";

export interface FieldSpec {
    Id: string;
    Label: string;
    Type: "text" | "password" | "url" | "checkbox" | "file";
    Placeholder?: string;
}

export interface SelectSpec {
    Id: string;
    Label: string;
    Options: ReadonlyArray<{ Value: string; Label: string }>;
    DefaultValue: string;
}

const buildLabel = (forId: string, text: string): HTMLLabelElement => {
    const label = document.createElement("label");
    label.className = CSS_LABEL;
    label.htmlFor = forId;
    label.textContent = text;

    return label;
};

const buildInput = (spec: FieldSpec): HTMLInputElement => {
    const input = document.createElement("input");
    input.id = spec.Id;
    input.type = spec.Type;
    input.className = CSS_INPUT;

    if (spec.Placeholder !== undefined) {
        input.placeholder = spec.Placeholder;
    }

    return input;
};

export const buildField = (spec: FieldSpec): HTMLDivElement => {
    const wrap = document.createElement("div");
    wrap.className = CSS_FIELD;
    wrap.appendChild(buildLabel(spec.Id, spec.Label));
    wrap.appendChild(buildInput(spec));

    return wrap;
};

const buildSelect = (spec: SelectSpec): HTMLSelectElement => {
    const select = document.createElement("select");
    select.id = spec.Id;
    select.className = CSS_SELECT;

    for (const opt of spec.Options) {
        const o = document.createElement("option");
        o.value = opt.Value;
        o.textContent = opt.Label;
        select.appendChild(o);
    }

    select.value = spec.DefaultValue;

    return select;
};

export const buildSelectField = (spec: SelectSpec): HTMLDivElement => {
    const wrap = document.createElement("div");
    wrap.className = CSS_FIELD;
    wrap.appendChild(buildLabel(spec.Id, spec.Label));
    wrap.appendChild(buildSelect(spec));

    return wrap;
};

export const buildTable = (id: string, headers: ReadonlyArray<string>): HTMLTableElement => {
    const table = document.createElement("table");
    table.id = id;
    table.className = CSS_TABLE;
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");

    for (const h of headers) {
        const th = document.createElement("th");
        th.textContent = h;
        tr.appendChild(th);
    }

    thead.appendChild(tr);
    table.appendChild(thead);
    table.appendChild(document.createElement("tbody"));

    return table;
};
