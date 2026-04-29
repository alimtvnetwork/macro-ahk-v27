/**
 * Marco Extension — Replay Resolver
 *
 * Phase 09 — Macro Recorder.
 *
 * Pure functions that translate a `Step`'s persisted selectors into the
 * single XPath expression a replay engine should evaluate.
 *
 * Resolution rules (deterministic):
 *   1. Take the row marked `IsPrimary = 1` for the Step.
 *   2. If it is `XPathFull` (kind 1) — return its Expression as-is.
 *   3. If it is `XPathRelative` (kind 2) — recursively resolve its
 *      `AnchorSelectorId` and concatenate `${anchor}${expression}`.
 *      The relative expression MUST start with `.` or `/`; if it starts
 *      with `.`, the leading dot is stripped before concatenation.
 *   4. CSS / Aria selectors (kinds 3, 4) — returned wrapped so a replay
 *      engine can dispatch on `kind`.
 *   5. Cycles in anchor chains throw.
 *
 * @see spec/31-macro-recorder/09-step-persistence-and-replay.md
 */

import { SelectorKindId } from "../recorder-db-schema";
import type { PersistedSelector } from "./step-persistence";

export interface ResolvedSelector {
    readonly Kind: "XPath" | "Css" | "Aria";
    readonly Expression: string;
    readonly AnchorChain: ReadonlyArray<number>;
}

const MAX_ANCHOR_DEPTH = 16;

export function resolveStepSelector(
    selectors: ReadonlyArray<PersistedSelector>,
): ResolvedSelector {
    const primary = selectors.find((s) => s.IsPrimary === 1);
    if (primary === undefined) {
        throw new Error("No primary selector found for Step");
    }
    const byId = new Map(selectors.map((s) => [s.SelectorId, s]));
    const chain: number[] = [];
    const expression = resolveOne(primary, byId, chain, 0);

    return {
        Kind: kindOf(primary.SelectorKindId),
        Expression: expression,
        AnchorChain: chain,
    };
}

function resolveOne(
    selector: PersistedSelector,
    byId: Map<number, PersistedSelector>,
    chain: number[],
    depth: number,
): string {
    if (depth > MAX_ANCHOR_DEPTH) {
        throw new Error(
            `Anchor chain exceeded max depth ${MAX_ANCHOR_DEPTH} — cycle suspected`,
        );
    }
    if (chain.includes(selector.SelectorId)) {
        throw new Error(
            `Cycle detected in anchor chain at SelectorId ${selector.SelectorId}`,
        );
    }
    chain.push(selector.SelectorId);

    if (selector.SelectorKindId === SelectorKindId.XPathFull) {
        return selector.Expression;
    }

    if (selector.SelectorKindId === SelectorKindId.XPathRelative) {
        if (selector.AnchorSelectorId === null) {
            throw new Error(
                `XPathRelative selector ${selector.SelectorId} has no AnchorSelectorId`,
            );
        }
        const anchor = byId.get(selector.AnchorSelectorId);
        if (anchor === undefined) {
            throw new Error(
                `Anchor selector ${selector.AnchorSelectorId} not in provided set`,
            );
        }
        const anchorXPath = resolveOne(anchor, byId, chain, depth + 1);
        return joinRelative(anchorXPath, selector.Expression);
    }

    // Css / Aria selectors return raw expression — replay engine routes on Kind.
    return selector.Expression;
}

function joinRelative(anchor: string, relative: string): string {
    const stripped = relative.startsWith(".") ? relative.slice(1) : relative;
    if (stripped.length === 0) return anchor;
    if (stripped.startsWith("/")) return `${anchor}${stripped}`;
    return `${anchor}/${stripped}`;
}

function kindOf(selectorKindId: number): ResolvedSelector["Kind"] {
    if (selectorKindId === SelectorKindId.Css) return "Css";
    if (selectorKindId === SelectorKindId.Aria) return "Aria";
    return "XPath";
}

export type { PersistedSelector };
