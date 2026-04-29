/**
 * Marco Extension — Failure Report Bundle Exporter
 *
 * Pure helpers that turn a selected list of {@link FailureReport}s into a
 * single JSON bundle suitable for sharing with an AI assistant.
 *
 * Kept UI-free so it can be unit-tested in node without jsdom and reused
 * by both the React panel and any future CLI/diagnostic dump.
 *
 * Bundle shape:
 *   {
 *     Generator:   "marco-extension",
 *     Version:     1,
 *     ExportedAt:  ISO string,
 *     Count:       number of reports,
 *     Reports:     FailureReport[]
 *   }
 *
 * @see ./failure-toast.ts            — Single-report copy/toast helper.
 * @see @/background/recorder/failure-logger — FailureReport shape.
 */

import type { FailureReport } from "@/background/recorder/failure-logger";

export interface FailureBundle {
    readonly Generator: "marco-extension";
    readonly Version: 1;
    readonly ExportedAt: string;
    readonly Count: number;
    readonly Reports: ReadonlyArray<FailureReport>;
}

export interface BuildBundleOpts {
    readonly Now?: () => Date;
}

/** Build the JSON-serialisable bundle (deterministic when `Now` is injected). */
export function buildFailureBundle(
    reports: ReadonlyArray<FailureReport>,
    opts: BuildBundleOpts = {},
): FailureBundle {
    const now = opts.Now ?? ((): Date => new Date());
    return {
        Generator: "marco-extension",
        Version: 1,
        ExportedAt: now().toISOString(),
        Count: reports.length,
        Reports: reports,
    };
}

/**
 * JSON output format for the export pipeline. "Pretty" uses 2-space
 * indent and trailing newline (default — best for diffing and pasting
 * into a ticket). "Minified" omits whitespace (best when uploading to
 * a service that parses bytes-on-the-wire or when filesize matters).
 */
export type ExportFormat = "pretty" | "minified";

export const DEFAULT_EXPORT_FORMAT: ExportFormat = "pretty";

/** Serialize ANY JSON value using the chosen export format. */
export function serializeJson(value: unknown, format: ExportFormat): string {
    return format === "pretty"
        ? JSON.stringify(value, null, 2)
        : JSON.stringify(value);
}

/** Pretty-printed JSON ready to drop into a Blob. */
export function serializeFailureBundle(
    bundle: FailureBundle,
    format: ExportFormat = DEFAULT_EXPORT_FORMAT,
): string {
    return serializeJson(bundle, format);
}

/**
 * Default filename: `marco-failure-reports-YYYY-MM-DD-HHmm.json`.
 * Uses UTC slice so the test suite stays deterministic with an injected `Now`.
 */
export function buildFailureBundleFilename(now: Date = new Date()): string {
    const iso = now.toISOString();             // 2026-04-26T10:30:00.000Z
    const date = iso.slice(0, 10);             // 2026-04-26
    const time = iso.slice(11, 16).replace(":", ""); // 1030
    return `marco-failure-reports-${date}-${time}.json`;
}

/* ------------------------------------------------------------------ */
/*  Single-report convenience (last-failure export)                    */
/* ------------------------------------------------------------------ */

/**
 * Picks the most recent report from `reports`. "Most recent" = max
 * `Timestamp` (ISO-8601 sorts lexicographically). When multiple reports
 * share the same timestamp the **last in array order** wins (preserves
 * insertion order from the recorder log). Returns `null` for empty input.
 */
export function pickLastFailureReport(
    reports: ReadonlyArray<FailureReport>,
): FailureReport | null {
    if (reports.length === 0) return null;
    let best: FailureReport = reports[0];
    for (let i = 1; i < reports.length; i++) {
        const candidate = reports[i];
        if (candidate.Timestamp >= best.Timestamp) {
            best = candidate;
        }
    }
    return best;
}

/**
 * Default filename for a single-report export, including StepId when
 * available so the file is self-identifying:
 * `marco-last-failure-step7-2026-04-26-1030.json`.
 */
export function buildLastFailureFilename(
    report: FailureReport,
    now: Date = new Date(),
): string {
    const iso = now.toISOString();
    const date = iso.slice(0, 10);
    const time = iso.slice(11, 16).replace(":", "");
    const stepTag = report.StepId !== null ? `-step${report.StepId}` : "";
    return `marco-last-failure${stepTag}-${date}-${time}.json`;
}

/* ------------------------------------------------------------------ */
/*  Per-step lookup (Step-picker export)                               */
/* ------------------------------------------------------------------ */

export interface StepFailureOption {
    /** StepId as stored on the report. `null` means "report has no StepId". */
    readonly StepId: number | null;
    /** Number of failure reports that share this StepId. */
    readonly Count: number;
    /** ISO timestamp of the most recent report for this StepId. */
    readonly LatestTimestamp: string;
    /** StepKind taken from the most recent report (may differ across retries). */
    readonly StepKind: string | null;
}

/**
 * Group reports by `StepId` for the export-by-step dropdown. Sorted by
 * `LatestTimestamp` descending so the most recently failing step is at
 * the top — that's what the user usually wants. Reports with `StepId === null`
 * are collapsed into a single "(no step id)" bucket at the end.
 */
export function listStepFailureOptions(
    reports: ReadonlyArray<FailureReport>,
): ReadonlyArray<StepFailureOption> {
    const buckets = new Map<string, {
        StepId: number | null;
        Count: number;
        LatestTimestamp: string;
        StepKind: string | null;
    }>();
    for (const r of reports) {
        const key = r.StepId === null ? "null" : String(r.StepId);
        const existing = buckets.get(key);
        if (!existing) {
            buckets.set(key, {
                StepId: r.StepId,
                Count: 1,
                LatestTimestamp: r.Timestamp,
                StepKind: r.StepKind,
            });
        } else {
            existing.Count += 1;
            if (r.Timestamp >= existing.LatestTimestamp) {
                existing.LatestTimestamp = r.Timestamp;
                existing.StepKind = r.StepKind;
            }
        }
    }
    const out = Array.from(buckets.values());
    out.sort((a, b) => {
        // null StepId always sinks to the bottom regardless of timestamp.
        if (a.StepId === null && b.StepId !== null) return 1;
        if (b.StepId === null && a.StepId !== null) return -1;
        if (a.LatestTimestamp === b.LatestTimestamp) return 0;
        return a.LatestTimestamp < b.LatestTimestamp ? 1 : -1;
    });
    return out;
}

/**
 * Pick the most recent report for a specific `StepId` (or `null` to find
 * the most recent report that has no StepId). Returns `null` when no
 * report matches. Tie-break: last in array order wins (preserves
 * insertion order from the recorder log), matching `pickLastFailureReport`.
 */
export function pickFailureReportByStepId(
    reports: ReadonlyArray<FailureReport>,
    stepId: number | null,
): FailureReport | null {
    let best: FailureReport | null = null;
    for (const r of reports) {
        if (r.StepId !== stepId) continue;
        if (best === null || r.Timestamp >= best.Timestamp) {
            best = r;
        }
    }
    return best;
}


