/**
 * User Add — minimal RFC 4180 splitter (project-scoped duplicate).
 *
 * Identical to Owner Switch's splitter; duplicated here to preserve
 * project-level isolation (no cross-project imports of internals). If
 * a future shared utilities project (`lovable-common-csv`) is created,
 * this file becomes a re-export.
 */

const CHAR_QUOTE = '"';
const CHAR_COMMA = ",";
const CHAR_CR = "\r";
const CHAR_LF = "\n";

const isLineBreak = (ch: string): boolean => ch === CHAR_CR || ch === CHAR_LF;

const finalizeRow = (rows: string[][], row: string[]): string[] => {
    if (row.length > 0) {
        rows.push(row);
    }

    return [];
};

interface SplitState {
    rows: string[][];
    row: string[];
    cell: string;
    inQuotes: boolean;
}

const handleQuote = (state: SplitState, next: string): void => {
    if (state.inQuotes && next === CHAR_QUOTE) {
        state.cell += CHAR_QUOTE;
        return;
    }

    state.inQuotes = !state.inQuotes;
};

const handleChar = (state: SplitState, ch: string, next: string): void => {
    if (ch === CHAR_QUOTE) {
        handleQuote(state, next);
        return;
    }

    if (!state.inQuotes && ch === CHAR_COMMA) {
        state.row.push(state.cell);
        state.cell = "";
        return;
    }

    if (!state.inQuotes && isLineBreak(ch)) {
        state.row.push(state.cell);
        state.cell = "";
        state.row = finalizeRow(state.rows, state.row);
        return;
    }

    state.cell += ch;
};

export const splitCsv = (text: string): string[][] => {
    const state: SplitState = { rows: [], row: [], cell: "", inQuotes: false };

    for (let i = 0; i < text.length; i += 1) {
        handleChar(state, text[i], i + 1 < text.length ? text[i + 1] : "");
    }

    if (state.cell.length > 0 || state.row.length > 0) {
        state.row.push(state.cell);
        finalizeRow(state.rows, state.row);
    }

    return state.rows;
};
