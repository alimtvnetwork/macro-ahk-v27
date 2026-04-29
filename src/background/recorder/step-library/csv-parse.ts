/**
 * Marco Extension — Minimal CSV Parser
 *
 * Zero-dep RFC 4180-ish parser tuned for the StepGroup input-data
 * use case. The recorded constraint (mem://workflow/no-questions-mode
 * decision) is **≤ 5 MB / 10 000 rows, fully in memory** — anything
 * larger should stream, which we don't support here.
 *
 * What we handle:
 *   - Comma OR semicolon delimiter (auto-detected from the header).
 *   - Quoted fields with embedded delimiters and newlines.
 *   - Escaped quotes inside quoted fields (`""` → `"`).
 *   - CRLF, LF, and CR line endings.
 *   - Trailing empty line in the file.
 *   - UTF-8 BOM at start of file (stripped).
 *
 * What we do NOT handle (out of scope — fail fast with a clear reason):
 *   - Tab-delimited files (use .tsv-aware tooling).
 *   - Files larger than `MAX_BYTES`.
 *   - Files producing more than `MAX_ROWS` data rows.
 *   - Headerless files. The first non-empty line MUST be the header.
 *
 * The parser returns a structured result — never throws on malformed
 * input. Callers surface the `Reason` to the user verbatim.
 */

export const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ROWS  = 10_000;          // data rows, header excluded

export interface CsvParseSuccess {
    readonly Ok: true;
    readonly Delimiter: "," | ";";
    readonly Headers: ReadonlyArray<string>;
    /** One row per data line, aligned with `Headers`. Missing trailing cells are coerced to "". */
    readonly Rows: ReadonlyArray<ReadonlyArray<string>>;
    /** Soft warnings — non-fatal anomalies the UI may surface. */
    readonly Warnings: ReadonlyArray<string>;
}

export interface CsvParseFailure {
    readonly Ok: false;
    readonly Reason: string;
    /** 1-based line number where parsing aborted, when known. */
    readonly LineNumber: number | null;
}

export type CsvParseResult = CsvParseSuccess | CsvParseFailure;

export function parseCsv(raw: string): CsvParseResult {
    if (raw.length === 0) {
        return { Ok: false, Reason: "CSV is empty.", LineNumber: null };
    }
    if (raw.length > MAX_BYTES) {
        return {
            Ok: false,
            Reason: `CSV exceeds the ${formatBytes(MAX_BYTES)} in-memory limit (got ${formatBytes(raw.length)}). Trim the file or split it.`,
            LineNumber: null,
        };
    }

    // Strip a UTF-8 BOM if present — Excel loves to add one.
    const source = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

    // Auto-detect delimiter from the FIRST non-empty line. We compare
    // unquoted occurrences of `,` vs `;`. Whichever appears more wins;
    // ties favour comma (the spec default).
    const delimiter = detectDelimiter(source);

    const warnings: string[] = [];
    const records: string[][] = [];
    let field = "";
    let row: string[] = [];
    let inQuotes = false;
    let line = 1;

    for (let i = 0; i < source.length; i++) {
        const ch = source[i];

        if (inQuotes) {
            if (ch === '"') {
                // Escaped quote (`""`) inside a quoted field.
                if (source[i + 1] === '"') {
                    field += '"';
                    i++;
                    continue;
                }
                inQuotes = false;
                continue;
            }
            if (ch === "\n") line++;
            field += ch;
            continue;
        }

        // Not inside quotes.
        if (ch === '"') {
            // Quote may only open at the start of a field. Anywhere
            // else, treat literally and warn — most spreadsheets emit
            // this for poorly-escaped data.
            if (field.length === 0) {
                inQuotes = true;
            } else {
                field += ch;
                if (warnings.length < 5) {
                    warnings.push(`Stray double-quote inside an unquoted field on line ${line} — kept literally.`);
                }
            }
            continue;
        }

        if (ch === delimiter) {
            row.push(field);
            field = "";
            continue;
        }

        if (ch === "\r") {
            // Treat CR / CRLF as a single newline.
            if (source[i + 1] === "\n") i++;
            row.push(field);
            records.push(row);
            row = [];
            field = "";
            line++;
            continue;
        }

        if (ch === "\n") {
            row.push(field);
            records.push(row);
            row = [];
            field = "";
            line++;
            continue;
        }

        field += ch;
    }

    if (inQuotes) {
        return {
            Ok: false,
            Reason: `Unterminated quoted field — file ends inside a "..." block. Check for a missing closing quote near line ${line}.`,
            LineNumber: line,
        };
    }

    // Flush the final partial row (no trailing newline).
    if (field !== "" || row.length > 0) {
        row.push(field);
        records.push(row);
    }

    // Drop trailing fully-empty records (a single trailing blank line
    // is normal; multiple blank rows we silently ignore).
    while (records.length > 0 && records[records.length - 1].every((c) => c === "")) {
        records.pop();
    }

    if (records.length === 0) {
        return { Ok: false, Reason: "CSV contained no rows after trimming blank lines.", LineNumber: null };
    }

    const headers = normaliseHeaders(records[0]);
    const headerDupes = findDuplicateHeaders(headers);
    if (headerDupes.length > 0) {
        return {
            Ok: false,
            Reason: `Duplicate column header(s): ${headerDupes.map((h) => `"${h}"`).join(", ")}. Each column must have a unique name.`,
            LineNumber: 1,
        };
    }
    if (headers.some((h) => h === "")) {
        return {
            Ok: false,
            Reason: "Header row contains an empty column name. Every column needs a header.",
            LineNumber: 1,
        };
    }

    const dataRows = records.slice(1);
    if (dataRows.length > MAX_ROWS) {
        return {
            Ok: false,
            Reason: `CSV has ${dataRows.length} data rows; the limit is ${MAX_ROWS}. Reduce or split the file.`,
            LineNumber: null,
        };
    }

    // Pad short rows / truncate long rows so every row aligns with the
    // header. We warn on each, capped to keep the toast readable.
    const aligned: string[][] = [];
    let padCount = 0;
    let truncCount = 0;
    for (let r = 0; r < dataRows.length; r++) {
        const original = dataRows[r];
        if (original.length < headers.length) {
            const padded = original.slice();
            while (padded.length < headers.length) padded.push("");
            aligned.push(padded);
            padCount++;
        } else if (original.length > headers.length) {
            aligned.push(original.slice(0, headers.length));
            truncCount++;
        } else {
            aligned.push(original);
        }
    }
    if (padCount > 0) warnings.push(`${padCount} row(s) had fewer columns than the header — padded with empty strings.`);
    if (truncCount > 0) warnings.push(`${truncCount} row(s) had extra columns — extras were dropped.`);

    return {
        Ok: true,
        Delimiter: delimiter,
        Headers: headers,
        Rows: aligned,
        Warnings: warnings,
    };
}

function detectDelimiter(source: string): "," | ";" {
    // Inspect the first line, ignoring quoted regions.
    let inQuotes = false;
    let commas = 0;
    let semis = 0;
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        if (ch === '"') {
            if (inQuotes && source[i + 1] === '"') { i++; continue; }
            inQuotes = !inQuotes;
            continue;
        }
        if (inQuotes) continue;
        if (ch === "\n" || ch === "\r") break;
        if (ch === ",") commas++;
        else if (ch === ";") semis++;
    }
    return semis > commas ? ";" : ",";
}

function normaliseHeaders(cells: ReadonlyArray<string>): string[] {
    return cells.map((c) => c.trim());
}

function findDuplicateHeaders(headers: ReadonlyArray<string>): string[] {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const h of headers) {
        if (h === "") continue;
        if (seen.has(h)) dupes.add(h);
        else seen.add(h);
    }
    return Array.from(dupes);
}

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
