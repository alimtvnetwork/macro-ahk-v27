/**
 * Marco Extension — Condition Evaluator (Spec 18)
 *
 * Pure DOM-only module that evaluates compound boolean condition trees over
 * selector predicates. Supersedes the single-predicate `wait-for-element.ts`
 * gate while remaining shape-compatible (an `Exists` leaf condition with a
 * `TimeoutMs` is exactly the old `WaitFor`).
 *
 * No chrome.* / no messaging — fully unit-testable under jsdom and reusable
 * from the content script.
 *
 * @see spec/31-macro-recorder/18-conditional-elements.md
 * @see ./wait-for-element.ts — Single-predicate predecessor.
 */

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type SelectorKind = "Auto" | "XPath" | "Css";

export type Matcher =
    | { readonly Kind: "Exists" }
    | { readonly Kind: "Visible" }
    | { readonly Kind: "TextEquals";   readonly Value: string; readonly CaseSensitive?: boolean }
    | { readonly Kind: "TextContains"; readonly Value: string; readonly CaseSensitive?: boolean }
    | { readonly Kind: "TextRegex";    readonly Pattern: string; readonly Flags?: string }
    | { readonly Kind: "AttrEquals";   readonly Name: string; readonly Value: string }
    | { readonly Kind: "AttrContains"; readonly Name: string; readonly Value: string }
    | { readonly Kind: "Count";        readonly Op: "eq" | "gte" | "lte"; readonly N: number };

export interface Predicate {
    readonly Selector: string;
    readonly SelectorKind?: SelectorKind;
    readonly Matcher: Matcher;
    readonly Negate?: boolean;
}

export type Condition =
    | Predicate
    | { readonly All: ReadonlyArray<Condition> }
    | { readonly Any: ReadonlyArray<Condition> }
    | { readonly Not: Condition };

export const MAX_CONDITION_DEPTH = 8;
export const MAX_PREDICATE_COUNT = 32;

export type ConditionWaitOutcome =
    | { readonly Ok: true;  readonly DurationMs: number; readonly Polls: number }
    | { readonly Ok: false; readonly DurationMs: number; readonly Polls: number;
        readonly Reason: "ConditionTimeout" | "InvalidSelector";
        readonly Detail: string;
        readonly LastEvaluation: PredicateEvaluation[] };

export interface PredicateEvaluation {
    readonly Selector: string;
    readonly Kind: "XPath" | "Css";
    readonly Matcher: string;
    readonly Result: boolean;
    readonly Detail?: string;
}

export interface EvaluateOptions {
    readonly Doc: Document;
    /** When provided, every predicate's outcome is appended for diagnostics. */
    readonly Trace?: PredicateEvaluation[];
}

export interface WaitOptions {
    readonly Doc: Document;
    readonly TimeoutMs: number;
    readonly PollMs?: number;
    readonly Sleep?: (ms: number) => Promise<void>;
    readonly Now?: () => number;
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

export function validateCondition(c: Condition): void {
    let predicateCount = 0;
    walk(c, 0, "");

    function walk(node: Condition, depth: number, path: string): void {
        if (depth > MAX_CONDITION_DEPTH) {
            throw new Error(
                `InvalidSelector: condition tree exceeds depth ${MAX_CONDITION_DEPTH} at ${path || "<root>"}`,
            );
        }
        if ("All" in node) {
            node.All.forEach((child, i) => walk(child, depth + 1, joinPath(path, `All[${i}]`)));
            return;
        }
        if ("Any" in node) {
            node.Any.forEach((child, i) => walk(child, depth + 1, joinPath(path, `Any[${i}]`)));
            return;
        }
        if ("Not" in node) { walk(node.Not, depth + 1, joinPath(path, "Not")); return; }
        predicateCount++;
        if (predicateCount > MAX_PREDICATE_COUNT) {
            throw new Error(
                `InvalidSelector: condition exceeds ${MAX_PREDICATE_COUNT} predicates at ${joinPath(path, node.Matcher.Kind)}`,
            );
        }
        validateMatcher(node, joinPath(path, node.Matcher.Kind));
    }
}

function joinPath(prefix: string, segment: string): string {
    return prefix.length === 0 ? segment : `${prefix}.${segment}`;
}

function validateMatcher(p: Predicate, path: string): void {
    const m = p.Matcher;
    if (m.Kind === "TextRegex") {
        try { new RegExp(m.Pattern, m.Flags ?? ""); }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`InvalidSelector: bad regex /${m.Pattern}/ at ${path} — ${msg}`);
        }
        return;
    }
    if ((m.Kind === "AttrEquals" || m.Kind === "AttrContains") && m.Name.length === 0) {
        throw new Error(`InvalidSelector: ${m.Kind} requires non-empty Name at ${path}`);
    }
    if (m.Kind === "Count" && m.N < 0) {
        throw new Error(`InvalidSelector: Count.N must be >= 0 at ${path} (got ${m.N})`);
    }
}

/* ------------------------------------------------------------------ */
/*  Evaluation                                                         */
/* ------------------------------------------------------------------ */

export function evaluateCondition(c: Condition, options: EvaluateOptions): boolean {
    if ("All" in c) {
        for (const child of c.All) {
            if (evaluateCondition(child, options) === false) return false;
        }
        return true;
    }
    if ("Any" in c) {
        for (const child of c.Any) {
            if (evaluateCondition(child, options)) return true;
        }
        return false;
    }
    if ("Not" in c) return evaluateCondition(c.Not, options) === false;

    const result = evaluatePredicate(c, options);
    return c.Negate === true ? result === false : result;
}

function evaluatePredicate(p: Predicate, options: EvaluateOptions): boolean {
    const kind = resolveSelectorKind(p.SelectorKind ?? "Auto", p.Selector);

    if (p.Matcher.Kind === "Count") {
        const count = locateAll(p.Selector, kind, options.Doc).length;
        const result = compareCount(count, p.Matcher.Op, p.Matcher.N);
        recordTrace(options, p, kind, result, `count=${count}`);
        return result;
    }

    const el = locateFirst(p.Selector, kind, options.Doc);
    if (el === null) {
        recordTrace(options, p, kind, p.Matcher.Kind === "Exists" ? false : false, "no match");
        return false;
    }

    const result = applyMatcher(el, p.Matcher);
    recordTrace(options, p, kind, result);
    return result;
}

function recordTrace(
    options: EvaluateOptions,
    p: Predicate,
    kind: "XPath" | "Css",
    result: boolean,
    detail?: string,
): void {
    if (options.Trace === undefined) return;
    options.Trace.push({
        Selector: p.Selector,
        Kind: kind,
        Matcher: p.Matcher.Kind,
        Result: p.Negate === true ? result === false : result,
        Detail: detail,
    });
}

function applyMatcher(el: Element, m: Matcher): boolean {
    switch (m.Kind) {
        case "Exists":
            return true;
        case "Visible":
            return isVisible(el);
        case "TextEquals": {
            const a = (el.textContent ?? "").trim();
            const b = m.Value;
            return m.CaseSensitive === false
                ? a.toLowerCase() === b.toLowerCase()
                : a === b;
        }
        case "TextContains": {
            const a = el.textContent ?? "";
            const b = m.Value;
            return m.CaseSensitive === false
                ? a.toLowerCase().includes(b.toLowerCase())
                : a.includes(b);
        }
        case "TextRegex": {
            const re = new RegExp(m.Pattern, m.Flags ?? "");
            return re.test(el.textContent ?? "");
        }
        case "AttrEquals": {
            const v = el.getAttribute(m.Name);
            return v !== null && v === m.Value;
        }
        case "AttrContains": {
            const v = el.getAttribute(m.Name);
            return v !== null && v.includes(m.Value);
        }
        case "Count":
            return false; // handled above
    }
}

function isVisible(el: Element): boolean {
    const win = el.ownerDocument?.defaultView;
    if (win === null || win === undefined) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const styles = win.getComputedStyle(el);
    if (styles.display === "none") return false;
    if (styles.visibility === "hidden") return false;
    return true;
}

function compareCount(count: number, op: "eq" | "gte" | "lte", n: number): boolean {
    if (op === "eq") return count === n;
    if (op === "gte") return count >= n;
    return count <= n;
}

/* ------------------------------------------------------------------ */
/*  Selector locators                                                  */
/* ------------------------------------------------------------------ */

export function resolveSelectorKind(kind: SelectorKind, expression: string): "XPath" | "Css" {
    if (kind === "XPath") return "XPath";
    if (kind === "Css") return "Css";
    const trimmed = expression.trimStart();
    return trimmed.startsWith("/") || trimmed.startsWith("(") ? "XPath" : "Css";
}

function locateFirst(expression: string, kind: "XPath" | "Css", doc: Document): Element | null {
    if (kind === "XPath") {
        const r = doc.evaluate(expression, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const node = r.singleNodeValue;
        return node instanceof Element ? node : null;
    }
    return doc.querySelector(expression);
}

function locateAll(expression: string, kind: "XPath" | "Css", doc: Document): Element[] {
    if (kind === "XPath") {
        const r = doc.evaluate(expression, doc, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        const out: Element[] = [];
        for (let i = 0; i < r.snapshotLength; i++) {
            const node = r.snapshotItem(i);
            if (node instanceof Element) out.push(node);
        }
        return out;
    }
    return Array.from(doc.querySelectorAll(expression));
}

/* ------------------------------------------------------------------ */
/*  Wait loop                                                          */
/* ------------------------------------------------------------------ */

export async function waitForCondition(
    condition: Condition,
    options: WaitOptions,
): Promise<ConditionWaitOutcome> {
    try { validateCondition(condition); }
    catch (err) {
        return {
            Ok: false,
            DurationMs: 0,
            Polls: 0,
            Reason: "InvalidSelector",
            Detail: err instanceof Error ? err.message : String(err),
            LastEvaluation: [],
        };
    }

    const sleep = options.Sleep ?? defaultSleep;
    const now = options.Now ?? defaultNow;
    const pollMs = Math.max(1, options.PollMs ?? 50);
    const started = now();
    const deadline = started + Math.max(0, options.TimeoutMs);
    let polls = 0;
    let lastTrace: PredicateEvaluation[] = [];
    let lastError: string | null = null;

    for (;;) {
        polls++;
        const trace: PredicateEvaluation[] = [];
        let result: boolean;
        try {
            result = evaluateCondition(condition, { Doc: options.Doc, Trace: trace });
        } catch (err) {
            return {
                Ok: false,
                DurationMs: now() - started,
                Polls: polls,
                Reason: "InvalidSelector",
                Detail: err instanceof Error ? err.message : String(err),
                LastEvaluation: trace,
            };
        }
        lastTrace = trace;
        lastError = null;

        if (result) return { Ok: true, DurationMs: now() - started, Polls: polls };
        if (now() >= deadline) {
            return {
                Ok: false,
                DurationMs: now() - started,
                Polls: polls,
                Reason: "ConditionTimeout",
                Detail: lastError ?? `Condition not met within ${options.TimeoutMs}ms`,
                LastEvaluation: lastTrace,
            };
        }
        await sleep(pollMs);
    }
}

function defaultSleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

function defaultNow(): number {
    return Date.now();
}
