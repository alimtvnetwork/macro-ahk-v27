/**
 * User Add popup — errors/warnings panel renderer.
 *
 * Identical shape to Owner Switch's `popup-errors.ts`. Pure render.
 */

import type { CsvParseError, CsvParseWarning } from "../csv";

const buildLi = (text: string): HTMLLIElement => {
    const li = document.createElement("li");
    li.textContent = text;

    return li;
};

const formatError = (err: CsvParseError): string => {
    const col = err.Column !== null ? `[${err.Column}]` : "";

    return `Row ${err.RowIndex} ${col} ${err.Message}`.trim();
};

const formatWarning = (warn: CsvParseWarning): string => {
    const idx = warn.RowIndex !== null ? `Row ${warn.RowIndex}: ` : "";

    return `${idx}${warn.Message}`;
};

export const renderErrors = (
    host: HTMLElement,
    errors: ReadonlyArray<CsvParseError>,
    warnings: ReadonlyArray<CsvParseWarning>,
): void => {
    host.textContent = "";

    if (errors.length === 0 && warnings.length === 0) {
        return;
    }

    const ul = document.createElement("ul");

    for (const e of errors) {
        ul.appendChild(buildLi(formatError(e)));
    }

    for (const w of warnings) {
        ul.appendChild(buildLi(formatWarning(w)));
    }

    host.appendChild(ul);
};
