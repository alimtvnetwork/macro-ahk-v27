/**
 * Run Summary — shared types + renderers for per-run reports.
 *
 * Both `lovable-owner-switch` and `lovable-user-add` produce a
 * `RunSummary` after a task completes. The summary is **storage-
 * agnostic**: it is built in pure code from the row results + log
 * entries the scripts already persist. Two output formats are emitted:
 *
 *   • JSON  — stable PascalCase keys, suitable for downstream tooling
 *             (CI dashboards, audit pipelines).
 *   • Text  — Markdown-flavoured human report listing every row, the
 *             actions taken, and the success/failure reason.
 *
 * No-rollback policy (mem://constraints/no-retry-policy) is reflected
 * in the renderers: failed rows surface the persisted replay hints
 * (`PromotedOwners` / `WorkspaceId`+`UserId`+`StepASucceeded`) so an
 * operator can re-run idempotently without rolling back.
 */

export enum RunSummaryScriptCode {
    OwnerSwitch = "OwnerSwitch",
    UserAdd = "UserAdd",
}

export enum RunSummaryRowStatus {
    Succeeded = "Succeeded",
    Failed = "Failed",
    PartiallySucceeded = "PartiallySucceeded",
}

export interface RunSummaryAction {
    /** Stable code (e.g. "ResolveWorkspace", "PromoteToOwner", "AddMembership"). */
    Code: string;
    /** "ok" / "skipped" / "failed". */
    Outcome: "ok" | "skipped" | "failed";
    /** Free-text detail (email, IDs, error message). */
    Detail: string | null;
}

export interface RunSummaryRow {
    RowIndex: number;
    Status: RunSummaryRowStatus;
    /** Outcome enum value persisted on the row (e.g. "PromoteFailedPartial"). */
    OutcomeCode: string;
    DurationMs: number;
    LastError: string | null;
    Actions: ReadonlyArray<RunSummaryAction>;
    /**
     * Replay hint: free-form structured data the operator needs to
     * re-execute the row safely. Keys are PascalCase and stable.
     */
    ReplayHint: Readonly<Record<string, string | number | boolean | null>>;
}

export interface RunSummaryCounts {
    Total: number;
    Succeeded: number;
    Failed: number;
    PartiallySucceeded: number;
}

export interface RunSummary {
    Script: RunSummaryScriptCode;
    TaskId: string;
    GeneratedAtUtc: string;
    Counts: RunSummaryCounts;
    Rows: ReadonlyArray<RunSummaryRow>;
    /** Aggregated WARN/ERROR messages emitted during the run. */
    Notices: ReadonlyArray<string>;
}

const STATUS_LABEL: Readonly<Record<RunSummaryRowStatus, string>> = Object.freeze({
    [RunSummaryRowStatus.Succeeded]: "✓",
    [RunSummaryRowStatus.Failed]: "✗",
    [RunSummaryRowStatus.PartiallySucceeded]: "◐",
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Refactor contract for the text renderers (KEEP THIS PATTERN)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The Markdown text output is intentionally built from **flat string pieces**,
 * never from nested template literals. Two conventions MUST be preserved by
 * future edits so the output stays byte-identical and the
 * `sonarjs/no-nested-template-literals` lint rule (promoted to `error` in
 * `eslint.config.js`) and `pnpm run check:no-nested-tpl` scanner stay green:
 *
 * 1. **`detailSuffix` / `error` / `notices` pattern** — any optional segment
 *    is materialised into a *plain `string` variable first* (empty string when
 *    absent, " — ${value}" / "\n  Error: ${value}" when present). The outer
 *    template literal then interpolates that variable directly. This avoids
 *    a `${cond ? `…${x}…` : ""}` nested template, which is the exact shape
 *    the scanner forbids in this file.
 *
 *      ✅  const detailSuffix = a.Detail === null ? "" : ` — ${a.Detail}`;
 *          return `    - [${a.Outcome}] ${a.Code}${detailSuffix}`;
 *
 *      ❌  return `    - [${a.Outcome}] ${a.Code}${a.Detail === null ? "" : ` — ${a.Detail}`}`;
 *
 * 2. **`head` array + `.join("\n")` pattern** — multi-line headers are built
 *    as an array of single-line string literals joined with `"\n"`, NOT as
 *    one giant backtick block with embedded newlines and nested
 *    interpolations. Long lines are composed via `+` string concatenation of
 *    single-interpolation template literals (each `${…}` lives in its own
 *    flat backtick segment), which keeps every interpolation top-level.
 *
 *      ✅  const head = [
 *              `# Run Summary — ${summary.Script}`,
 *              `Task: ${summary.TaskId}`,
 *              `Total: ${c.Total} | ` +
 *              `Succeeded: ${c.Succeeded} | ` +
 *              `Failed: ${c.Failed}`,
 *          ].join("\n");
 *
 *      ❌  const head = `# Run Summary — ${summary.Script}
 *          Task: ${summary.TaskId}
 *          Total: ${c.Total} | Succeeded: ${`${c.Succeeded}`}`;
 *
 * If you need to add a new optional line, follow pattern (1): create a
 * `xSuffix` / `xBlock` variable that is `""` when absent and the formatted
 * fragment when present, then interpolate it once into the final return. If
 * you need to add a new header line, append a string to the `head` array.
 *
 * Output stability: the Markdown text is consumed by operators and by JSON
 * round-trip diff tooling — any whitespace or punctuation change is a
 * breaking change. Snapshot tests in `standalone-scripts/lovable-common`
 * pin the exact bytes; run `pnpm --filter lovable-common test` after edits.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const renderRunSummaryAsJson = (summary: RunSummary): string => {
    return JSON.stringify(summary, null, 2);
};

const renderActions = (actions: ReadonlyArray<RunSummaryAction>): string => {
    if (actions.length === 0) {
        return "    (no actions recorded)";
    }

    return actions
        .map((a) => {
            const detailSuffix = a.Detail === null ? "" : ` — ${a.Detail}`;
            return `    - [${a.Outcome}] ${a.Code}${detailSuffix}`;
        })
        .join("\n");
};

const renderReplayHint = (hint: RunSummaryRow["ReplayHint"]): string => {
    const keys = Object.keys(hint);

    if (keys.length === 0) {
        return "    (none)";
    }

    return keys.map((k) => `    - ${k}: ${String(hint[k])}`).join("\n");
};

const renderRow = (row: RunSummaryRow): string => {
    const header = `### Row ${row.RowIndex} ${STATUS_LABEL[row.Status]} ${row.OutcomeCode} (${row.DurationMs}ms)`;
    const error = row.LastError === null ? "" : `\n  Error: ${row.LastError}`;

    return `${header}${error}\n  Actions:\n${renderActions(row.Actions)}\n  Replay hint:\n${renderReplayHint(row.ReplayHint)}`;
};

export const renderRunSummaryAsText = (summary: RunSummary): string => {
    const head = [
        `# Run Summary — ${summary.Script}`,
        `Task: ${summary.TaskId}`,
        `Generated: ${summary.GeneratedAtUtc}`,
        "",
        `Total: ${summary.Counts.Total} | ` +
        `Succeeded: ${summary.Counts.Succeeded} | ` +
        `Failed: ${summary.Counts.Failed} | ` +
        `Partial: ${summary.Counts.PartiallySucceeded}`,
        "",
    ].join("\n");

    const body = summary.Rows.map(renderRow).join("\n\n");
    const noticeLines = summary.Notices.map((n) => `- ${n}`).join("\n");
    const notices = summary.Notices.length === 0
        ? ""
        : `\n\n## Notices\n${noticeLines}`;

    return `${head}\n${body}${notices}\n`;
};
