/**
 * User Add — row-level + file-level validation.
 *
 * `validateRow` enforces:
 *   - `MemberEmail` format (RFC-lite, see `email-validator.ts`)
 *   - `WorkspaceUrl` is a Lovable URL with a non-empty workspace path
 *     segment (rejects bare `https://lovable.dev/` and queries-only)
 *   - `Notes` length cap
 *
 * `validateFile` runs once after all rows are built and detects
 * duplicate `(WorkspaceUrl, MemberEmail)` pairs across the file —
 * adding the same user to the same workspace twice is the most
 * common cause of `409 Conflict` from POST /memberships.
 *
 * Role validity is enforced by the normalizer during row build
 * (errors there are pushed as parse errors). Never throws.
 */

import { UserAddCsvColumn } from "./csv-column";
import { isValidEmail } from "./email-validator";
import type { UserAddCsvRow, CsvParseError } from "./csv-types";

const LOVABLE_HOST = "lovable.dev";
const MAX_NOTES_LENGTH = 500;
const MAX_WORKSPACE_URL_LENGTH = 2048; // browser URL practical cap

interface WorkspaceUrlCheck {
    Ok: boolean;
    Reason: string | null;
}

const checkWorkspaceUrl = (value: string): WorkspaceUrlCheck => {
    if (value.length > MAX_WORKSPACE_URL_LENGTH) {
        return { Ok: false, Reason: `URL exceeds max length ${MAX_WORKSPACE_URL_LENGTH}` };
    }

    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        return { Ok: false, Reason: "URL is not parseable" };
    }

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { Ok: false, Reason: `Unsupported protocol: ${parsed.protocol}` };
    }

    const hostOk = parsed.host === LOVABLE_HOST || parsed.host.endsWith(`.${LOVABLE_HOST}`);
    if (!hostOk) {
        return { Ok: false, Reason: `Host is not a Lovable domain: ${parsed.host}` };
    }

    // Reject bare `lovable.dev/` or `lovable.dev` — every workspace URL
    // includes at least one path segment (slug, project id, or `/projects/...`).
    const trimmedPath = parsed.pathname.replace(/^\/+|\/+$/g, "");
    if (trimmedPath.length === 0) {
        return { Ok: false, Reason: "URL is missing a workspace path segment" };
    }

    return { Ok: true, Reason: null };
};

export const validateRow = (row: UserAddCsvRow): ReadonlyArray<CsvParseError> => {
    const errors: CsvParseError[] = [];

    if (!isValidEmail(row.MemberEmail)) {
        errors.push({
            RowIndex: row.RowIndex,
            Column: UserAddCsvColumn.MemberEmail,
            Message: `Invalid email in MemberEmail: ${row.MemberEmail}`,
        });
    }

    const urlCheck = checkWorkspaceUrl(row.WorkspaceUrl);
    if (!urlCheck.Ok) {
        errors.push({
            RowIndex: row.RowIndex,
            Column: UserAddCsvColumn.WorkspaceUrl,
            Message: `Invalid Lovable workspace URL: ${row.WorkspaceUrl} (${urlCheck.Reason})`,
        });
    }

    if (row.Notes !== null && row.Notes.length > MAX_NOTES_LENGTH) {
        errors.push({
            RowIndex: row.RowIndex,
            Column: UserAddCsvColumn.Notes,
            Message: `Notes exceeds max length ${MAX_NOTES_LENGTH} (got ${row.Notes.length})`,
        });
    }

    return errors;
};

/**
 * File-level pass: detect duplicate `(WorkspaceUrl, MemberEmail)` pairs.
 * Each duplicate row gets its own error so every offender surfaces.
 */
export const validateFile = (
    rows: ReadonlyArray<UserAddCsvRow>,
): ReadonlyArray<CsvParseError> => {
    const errors: CsvParseError[] = [];
    const seenAt = new Map<string, number>();

    for (const row of rows) {
        const key = `${row.WorkspaceUrl.trim().toLowerCase()}|${row.MemberEmail.trim().toLowerCase()}`;
        const firstSeen = seenAt.get(key);

        if (firstSeen === undefined) {
            seenAt.set(key, row.RowIndex);
            continue;
        }

        errors.push({
            RowIndex: row.RowIndex,
            Column: UserAddCsvColumn.MemberEmail,
            Message: `Duplicate (WorkspaceUrl, MemberEmail) pair — first seen on row ${firstSeen}`,
        });
    }

    return errors;
};
