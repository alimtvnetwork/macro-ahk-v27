/**
 * Shared XPath Editor — table → row reader.
 *
 * Reads back the current cell values into a typed `XPathEditorRow[]`.
 * Defensive: bad delay parses fall back to 0, missing inputs preserve
 * the original row (caller can compare against `Initial` to surface
 * "no change"). No casts, no `unknown`.
 */

import type { XPathEditorRow } from "./xpath-editor-types";

interface RowInputs {
    XPath: HTMLInputElement;
    Delay: HTMLInputElement;
}

const findRowInputs = (tr: HTMLTableRowElement): RowInputs | null => {
    const xp = tr.cells[1]?.querySelector("input");
    const delay = tr.cells[2]?.querySelector("input");

    if (!(xp instanceof HTMLInputElement) || !(delay instanceof HTMLInputElement)) {
        return null;
    }

    return { XPath: xp, Delay: delay };
};

const parseDelayMs = (raw: string): number => {
    const n = Number.parseInt(raw, 10);

    if (Number.isNaN(n) || n < 0) {
        return 0;
    }

    return n;
};

export const readEditorRows = (
    table: HTMLTableElement, original: ReadonlyArray<XPathEditorRow>,
): ReadonlyArray<XPathEditorRow> => {
    const tbody = table.tBodies[0];

    if (tbody === undefined) {
        return original;
    }

    const out: XPathEditorRow[] = [];

    for (let i = 0; i < tbody.rows.length; i += 1) {
        const inputs = findRowInputs(tbody.rows[i]);
        const seed = original[i];

        if (inputs === null || seed === undefined) {
            continue;
        }

        out.push({ KeyCode: seed.KeyCode, XPath: inputs.XPath.value, DelayMs: parseDelayMs(inputs.Delay.value) });
    }

    return out;
};
