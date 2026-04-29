/**
 * Marco Extension — Selector Comparison Bundle Exporter
 *
 * Pure helpers that turn a {@link SelectorComparison} (the per-selector
 * outcome of a replay attempt) into a downloadable JSON bundle suitable
 * for sharing with an AI assistant or attaching to a bug report.
 *
 * Bundle shape:
 *   {
 *     Generator:   "marco-extension",
 *     Kind:        "SelectorComparison",
 *     Version:     1,
 *     ExportedAt:  ISO string,
 *     StepId:      number | null,
 *     Url:         string | null,    // page URL when available
 *     Comparison:  SelectorComparison
 *   }
 *
 * Mirrors the failure-export bundle conventions so all Marco diagnostic
 * dumps look familiar to humans and AIs.
 *
 * @see ./failure-export.ts — Sister exporter for FailureReport bundles.
 */

import type { SelectorComparison } from "@/background/recorder/selector-comparison";

export interface SelectorComparisonBundle {
    readonly Generator: "marco-extension";
    readonly Kind: "SelectorComparison";
    readonly Version: 1;
    readonly ExportedAt: string;
    readonly StepId: number | null;
    readonly Url: string | null;
    readonly Comparison: SelectorComparison;
}

export interface BuildSelectorBundleOpts {
    readonly StepId?: number;
    readonly Url?: string;
    readonly Now?: () => Date;
}

/** Build the JSON-serialisable bundle (deterministic when `Now` is injected). */
export function buildSelectorComparisonBundle(
    comparison: SelectorComparison,
    opts: BuildSelectorBundleOpts = {},
): SelectorComparisonBundle {
    const now = opts.Now ?? ((): Date => new Date());
    return {
        Generator: "marco-extension",
        Kind: "SelectorComparison",
        Version: 1,
        ExportedAt: now().toISOString(),
        StepId: opts.StepId ?? null,
        Url: opts.Url ?? null,
        Comparison: comparison,
    };
}

/** Pretty-printed JSON ready to drop into a Blob. */
export function serializeSelectorComparisonBundle(bundle: SelectorComparisonBundle): string {
    return JSON.stringify(bundle, null, 2);
}

/**
 * Default filename:
 *   `marco-selector-comparison-step<id>-YYYY-MM-DD-HHmm.json`
 * Falls back to `step-na` when no StepId is provided.
 */
export function buildSelectorComparisonFilename(
    stepId: number | null,
    now: Date = new Date(),
): string {
    const iso = now.toISOString();
    const date = iso.slice(0, 10);
    const time = iso.slice(11, 16).replace(":", "");
    const stepFragment = stepId !== null ? `step${stepId}` : "step-na";
    return `marco-selector-comparison-${stepFragment}-${date}-${time}.json`;
}
